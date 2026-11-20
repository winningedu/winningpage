// 위닝 수행 주제 DB, 위닝 수행 자료 DB 목록 상단의 엑셀 일괄 등록 패널.
// 흐름: 내려받기 / 올리기, 파싱 미리보기 모달, 중복 검사(정확 일치는 기본 제외,
// 근사 일치는 경고), 반영(api/admin/knowledge-bulk) 뒤 임베딩 backfill 을 embedded 가
// 0 이 될 때까지 반복한다. 단계 전이는 bulkFlow.ts, 판단은 plan.ts, 파싱은 xlsx.ts.
// 이 파일은 버튼 두 개와 미리보기 Dialog 껍데기만 든다. 서버 호출 순서는 bulkRun.ts.

import { Download } from "lucide-react";
import { useReducer, useRef } from "react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ApplyProgress from "./ApplyProgress";
import { bulkReducer, INITIAL_BULK_STATE, isBulkBusy } from "./bulkFlow";
import { runApply, runDedupe } from "./bulkRun";
import { dedupeSummary } from "./DedupeResult";
import PreviewTable from "./PreviewTable";
import { defaultSelection } from "./plan";
import {
  exportKnowledgeRowsToXlsx,
  type KnowledgeBulkField,
  parseKnowledgeRowsFromXlsx,
} from "./xlsx";
import { downloadXlsx } from "./xlsxDownload";

type PanelConfig = {
  title: string;
  fields: KnowledgeBulkField[];
  fixedValues: Record<string, unknown>;
  defaults: Record<string, unknown>;
};

export default function BulkPanel({
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
  const [state, dispatch] = useReducer(bulkReducer, INITIAL_BULK_STATE);
  const busy = isBulkBusy(state);
  const draft = "parse" in state ? state : null;
  const dedupe = "dedupe" in state ? state.dedupe : null;
  const candidateCount = draft
    ? draft.parse.inserts.length + draft.parse.updates.length
    : 0;

  function handleDownload() {
    downloadXlsx(
      exportKnowledgeRowsToXlsx(rows, config.fields),
      config.title,
      new Date(),
    );
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    dispatch({ type: "fileStarted" });
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parse = await parseKnowledgeRowsFromXlsx(workbook, {
        fields: config.fields,
        fixedValues: config.fixedValues,
        defaults: config.defaults,
        existingIds: new Set(rows.map((row) => String(row.id))),
      });
      dispatch({
        type: "fileParsed",
        parse,
        selected: defaultSelection(parse, []),
      });
    } catch (error) {
      dispatch({
        type: "fileFailed",
        message: `파일을 읽지 못했습니다: ${(error as Error).message}`,
      });
    }
  }

  function handleDedupe() {
    if (state.phase !== "parsed" && state.phase !== "checked") return;
    void runDedupe({ knowledgeType, parse: state.parse, dispatch });
  }

  function handleApply() {
    if (state.phase !== "checked") return;
    void runApply({
      knowledgeType,
      parse: state.parse,
      selected: state.selected,
      dispatch,
      onReload,
    });
  }

  const notice =
    state.phase === "done" || state.phase === "error" ? state.message : "";
  const error = "error" in state ? state.error : "";
  const progress = "progress" in state ? state.progress : "";

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">엑셀 일괄 등록</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleDownload}
            disabled={busy}
          >
            <Download aria-hidden="true" />
            엑셀 내려받기 ({rows.length.toLocaleString()}행)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            엑셀 올리기
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            tabIndex={-1}
            className="sr-only"
            aria-label={`${config.title} xlsx 파일 선택`}
          />
        </div>
      </div>

      {notice && (
        <p className="mt-3 border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground">
          {notice}
        </p>
      )}

      <Dialog
        open={draft !== null}
        disablePointerDismissal
        onOpenChange={(open, eventDetails) => {
          if (open) return;
          // 반영 중에 닫으면 결과를 보지 못한 채 반영이 끝난다. 진행 중에는 모든 닫기를 막는다.
          // eventDetails.cancel(): Base UI onOpenChange 취소 API (SensitiveActionGate 와 같은 방식)
          if (busy) {
            eventDetails.cancel();
            return;
          }
          dispatch({ type: "close" });
        }}
      >
        <DialogContent className="sm:max-w-[60rem]">
          <DialogHeader>
            <DialogTitle>{config.title} 엑셀 올리기 미리보기</DialogTitle>
            <DialogDescription>
              신규 {draft?.parse.inserts.length ?? 0}건, 수정{" "}
              {draft?.parse.updates.length ?? 0}건, 오류{" "}
              {draft?.parse.errors.length ?? 0}건{dedupeSummary(dedupe)}
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <PreviewTable
              parse={draft.parse}
              dedupe={dedupe}
              selected={draft.selected}
              disabled={busy}
              onToggle={(rowNo) => dispatch({ type: "toggle", rowNo })}
            />
          )}

          {error && (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <ApplyProgress
              progress={progress}
              selectedCount={draft?.selected.size ?? 0}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleDedupe}
                disabled={busy || candidateCount === 0}
              >
                중복 검사
              </Button>
              <Button
                type="button"
                size="lg"
                className="font-semibold"
                onClick={handleApply}
                disabled={busy || !dedupe || (draft?.selected.size ?? 0) === 0}
              >
                반영
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => dispatch({ type: "close" })}
                disabled={busy}
              >
                취소
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
