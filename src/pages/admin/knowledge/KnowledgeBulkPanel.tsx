// 위닝 수행 주제 DB, 위닝 수행 자료 DB 목록 상단의 엑셀 일괄 등록 패널.
// 흐름: 내려받기 / 올리기, 파싱 미리보기 모달, 중복 검사(정확 일치는 기본 제외,
// 근사 일치는 경고), 반영(admin-knowledge-bulk) 뒤 임베딩 backfill 을 embedded 가
// 0 이 될 때까지 반복한다. 판단은 knowledgeBulkPlan.ts, 파싱은 knowledgeBulkXlsx.ts.

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  exportKnowledgeRowsToXlsx,
  type KnowledgeBulkField,
  type KnowledgeParseResult,
  parseKnowledgeRowsFromXlsx,
} from "@/lib/knowledgeBulkXlsx";
import { MAX_BULK_ROWS } from "../../../../api/_lib/performance/knowledgeBulk.js";
import type { DedupeResult } from "../../../../api/_lib/performance/knowledgeDedupe.js";
import { runBackfillUntilDone } from "./backfillLoop";
import {
  postEmbedBackfill,
  postKnowledgeBulk,
  postKnowledgeDedupe,
} from "./knowledgeBulkApi";
import {
  buildBulkRequests,
  buildDedupeItems,
  chunk,
  defaultSelection,
} from "./knowledgeBulkPlan";

// 중복 검사는 행마다 임베딩을 1회 부른다. 서버 상한(200건)보다 작게 끊어 한 요청이
// 함수 실행 상한(60초) 안에 끝나게 한다.
const DEDUPE_CHUNK = 50;

const BUTTON_CLASS =
  "h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50";

type PanelConfig = {
  title: string;
  fields: KnowledgeBulkField[];
  fixedValues: Record<string, unknown>;
  defaults: Record<string, unknown>;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function triggerXlsxDownload(workbook: XLSX.WorkBook, fileName: string) {
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function KnowledgeBulkPanel({
  config,
  rows,
  onReload,
}: {
  config: PanelConfig;
  rows: Record<string, unknown>[];
  onReload: () => void;
}) {
  const knowledgeType = String(config.fixedValues.knowledge_type);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parse, setParse] = useState<KnowledgeParseResult | null>(null);
  const [message, setMessage] = useState("");
  const [dedupe, setDedupe] = useState<Map<number, DedupeResult> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => (parse ? [...parse.inserts, ...parse.updates] : []),
    [parse],
  );

  function handleDownload() {
    const workbook = exportKnowledgeRowsToXlsx(rows, config.fields);
    const today = new Date();
    triggerXlsxDownload(
      workbook,
      `${config.title}_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`,
    );
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    setDedupe(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const result = await parseKnowledgeRowsFromXlsx(workbook, {
        fields: config.fields,
        fixedValues: config.fixedValues,
        defaults: config.defaults,
        existingIds: new Set(rows.map((row) => String(row.id))),
      });
      setParse(result);
      setSelected(defaultSelection(result, []));
    } catch (error) {
      setMessage(`파일을 읽지 못했습니다: ${(error as Error).message}`);
    }
  }

  async function handleDedupe() {
    if (!parse || busy) return;
    setBusy(true);
    setMessage("");
    const items = buildDedupeItems(parse);
    const merged = new Map<number, DedupeResult>();
    try {
      for (const part of chunk(items, DEDUPE_CHUNK)) {
        setProgress(`중복 검사 중 ${merged.size} / ${items.length}행`);
        const results = await postKnowledgeDedupe(knowledgeType, part);
        for (const result of results) merged.set(result.rowNo, result);
      }
      setDedupe(merged);
      setSelected(defaultSelection(parse, [...merged.values()]));
    } catch (error) {
      setMessage(`중복 검사에 실패했습니다: ${(error as Error).message}`);
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!parse || busy) return;
    setBusy(true);
    setMessage("");
    const requests = buildBulkRequests(
      knowledgeType,
      parse,
      selected,
      MAX_BULK_ROWS,
    );
    let inserted = 0;
    let updated = 0;
    try {
      for (const request of requests) {
        setProgress(`반영 중 ${inserted + updated} / ${selected.size}행`);
        const result = await postKnowledgeBulk(request);
        inserted += result.inserted;
        updated += result.updated;
      }
      setProgress("임베딩 중");
      const backfill = await runBackfillUntilDone(postEmbedBackfill, (p) =>
        setProgress(`임베딩 중 ${p.embedded}건 완료 (${p.rounds}회차)`),
      );
      setParse(null);
      setDedupe(null);
      onReload();
      const failedNote =
        backfill.lastFailed > 0
          ? ` 임베딩 실패 ${backfill.lastFailed}건은 목록에서 사유를 확인하세요.`
          : "";
      setMessage(
        `반영 완료: 신규 ${inserted}건, 수정 ${updated}건, 임베딩 ${backfill.embedded}건.${failedNote}`,
      );
    } catch (error) {
      onReload();
      setMessage(
        `반영에 실패했습니다. 이미 반영된 묶음은 되돌려지지 않습니다(신규 ${inserted}건, 수정 ${updated}건 반영됨): ${(error as Error).message}`,
      );
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  function toggle(rowNo: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNo)) next.delete(rowNo);
      else next.add(rowNo);
      return next;
    });
  }

  const exactCount = dedupe
    ? [...dedupe.values()].filter((r) => r.exact.length > 0).length
    : 0;
  const nearCount = dedupe
    ? [...dedupe.values()].filter((r) => r.near.length > 0).length
    : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 등록</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className={BUTTON_CLASS}
          >
            엑셀 내려받기 ({rows.length.toLocaleString()}행)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className={BUTTON_CLASS}
          >
            엑셀 올리기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label={`${config.title} xlsx 파일 선택`}
          />
        </div>
      </div>

      {message && !parse && (
        <p className="mt-3 border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700">
          {message}
        </p>
      )}

      <Dialog
        open={parse !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setParse(null);
        }}
      >
        <DialogContent className="sm:max-w-[60rem]">
          <DialogHeader>
            <DialogTitle>{config.title} 엑셀 올리기 미리보기</DialogTitle>
            <DialogDescription>
              신규 {parse?.inserts.length ?? 0}건, 수정{" "}
              {parse?.updates.length ?? 0}건, 오류 {parse?.errors.length ?? 0}건
              {dedupe &&
                `, 정확 일치 ${exactCount}건(기본 제외), 근사 일치 ${nearCount}건(경고)`}
            </DialogDescription>
          </DialogHeader>

          {parse && parse.errors.length > 0 && (
            <div className="max-h-[10rem] overflow-y-auto border border-red-300 bg-red-50 p-2 text-xs">
              <p className="font-black text-red-600">
                오류 행 {parse.errors.length}건은 반영하지 않습니다.
              </p>
              <table className="mt-1 w-full text-left text-red-700">
                <thead>
                  <tr>
                    <th className="w-[4rem]">행</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {parse.errors.map((error) => (
                    <tr key={`${error.rowNo}-${error.reason}`}>
                      <td>{error.rowNo}</td>
                      <td>{error.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="max-h-[24rem] overflow-y-auto border border-gray-200 text-xs">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="w-[3rem] px-2 py-1">반영</th>
                    <th className="w-[4rem] px-2 py-1">행</th>
                    <th className="w-[4rem] px-2 py-1">구분</th>
                    <th className="px-2 py-1">제목</th>
                    <th className="px-2 py-1">중복</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((row) => {
                    const found = dedupe?.get(row.rowNo);
                    return (
                      <tr key={row.rowNo} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={selected.has(row.rowNo)}
                            onChange={() => toggle(row.rowNo)}
                            disabled={busy}
                            aria-label={`${row.rowNo}행 반영`}
                          />
                        </td>
                        <td className="px-2 py-1">{row.rowNo}</td>
                        <td className="px-2 py-1">
                          {row.id ? "수정" : "신규"}
                        </td>
                        <td className="px-2 py-1">
                          {String(row.values.title ?? "")}
                        </td>
                        <td className="px-2 py-1">
                          {found && found.exact.length > 0 && (
                            <p className="font-bold text-red-600">
                              정확 일치:{" "}
                              {found.exact.map((m) => m.title).join(", ")}
                            </p>
                          )}
                          {found && found.near.length > 0 && (
                            <p className="font-bold text-amber-700">
                              근사 일치:{" "}
                              {found.near
                                .map(
                                  (m) =>
                                    `${m.title} (${Math.round(m.similarity * 100)}%)`,
                                )
                                .join(", ")}
                            </p>
                          )}
                          {dedupe && !found && (
                            <span className="text-gray-400">검사 안 함</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {message && (
            <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
              {message}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-gray-600">
              {progress || `반영 대상 ${selected.size}행`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDedupe}
                disabled={busy || candidates.length === 0}
                className={BUTTON_CLASS}
              >
                중복 검사
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={busy || !dedupe || selected.size === 0}
                className="h-9 bg-[#2348ff] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                반영
              </button>
              <button
                type="button"
                onClick={() => setParse(null)}
                disabled={busy}
                className={BUTTON_CLASS}
              >
                취소
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
