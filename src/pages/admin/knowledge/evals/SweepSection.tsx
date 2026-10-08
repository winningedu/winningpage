import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { postSweep, type SweepResponse } from "./api";
import ErrorBox from "./ErrorBox";
import {
  type EvalParams,
  isSameParams,
  type KnowledgeType,
  type SweepDraft,
  sortSweepItems,
  toSweepGrid,
} from "./form";
import { formatMetric, formatParams, RECALL_KS } from "./format";
import { Td, Th } from "./TableCells";

const EMPTY_SWEEP_DRAFT: SweepDraft = {
  rrfK: "",
  weights: "",
  matchThreshold: "",
};

export default function SweepSection({
  knowledgeType,
  productionParams,
  onSaved,
}: {
  knowledgeType: KnowledgeType;
  productionParams: EvalParams;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SweepDraft>(EMPTY_SWEEP_DRAFT);
  const [result, setResult] = useState<SweepResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    const parsed = toSweepGrid(draft);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await postSweep({ knowledgeType, grid: parsed.grid });
    setBusy(false);
    if (!response.ok) {
      setMessage(response.message);
      return;
    }
    setResult(response.data);
    onSaved();
  }

  const items = result ? sortSweepItems(result.items) : [];

  return (
    <div className="bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black">조합 비교</h2>
      <p className="mt-1 text-xs font-bold text-gray-500">
        하이브리드 모드로 목록의 모든 조합을 돌립니다. 조합은 24개까지이고 빈
        칸은 운영값 하나로 채웁니다.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-[12rem]">
          <Field label="RRF k 목록">
            <TextInput
              value={draft.rrfK}
              onChange={(rrfK) => setDraft((prev) => ({ ...prev, rrfK }))}
              placeholder={`예 20, ${productionParams.rrfK}`}
            />
          </Field>
        </div>
        <div className="w-[16rem]">
          <Field label="가중치 쌍(단어:의미) 목록">
            <TextInput
              value={draft.weights}
              onChange={(weights) => setDraft((prev) => ({ ...prev, weights }))}
              placeholder={`예 ${productionParams.fullTextWeight}:${productionParams.semanticWeight}, 0.5:1.5`}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label="threshold 목록">
            <TextInput
              value={draft.matchThreshold}
              onChange={(matchThreshold) =>
                setDraft((prev) => ({ ...prev, matchThreshold }))
              }
              placeholder={`예 0.45, ${productionParams.matchThreshold}`}
            />
          </Field>
        </div>
        <ActionButton onClick={run} disabled={busy}>
          {busy ? "비교 중" : "조합 비교 실행"}
        </ActionButton>
      </div>
      {message && (
        <div className="mt-4">
          <ErrorBox message={message} />
        </div>
      )}
      {result && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-bold text-gray-500">
            질의 {result.queryCount}건 / 굵은 행이 운영값 조합입니다.
          </div>
          <ScrollArea axis="x">
            <table className="w-full min-w-[70rem] border-collapse text-sm">
              <thead>
                <tr className="border-y border-gray-300">
                  <Th>RRF k</Th>
                  <Th>단어 가중치</Th>
                  <Th>의미 가중치</Th>
                  <Th>threshold</Th>
                  {RECALL_KS.map((k) => (
                    <Th key={k}>recall@{k}</Th>
                  ))}
                  <Th>MRR</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isProduction = isSameParams(
                    item.params,
                    productionParams,
                  );
                  return (
                    <tr
                      key={formatParams(item.params)}
                      className={`border-b border-gray-100 ${isProduction ? "bg-amber-50 font-black" : ""} ${item.status === "skipped" ? "text-gray-400" : ""}`}
                    >
                      <Td>{item.params.rrfK}</Td>
                      <Td>{item.params.fullTextWeight}</Td>
                      <Td>{item.params.semanticWeight}</Td>
                      <Td>{item.params.matchThreshold}</Td>
                      {item.status === "done" ? (
                        <>
                          {RECALL_KS.map((k) => (
                            <Td key={k}>
                              {formatMetric(item.metrics.recall[k])}
                            </Td>
                          ))}
                          <Td>{formatMetric(item.metrics.mrr)}</Td>
                        </>
                      ) : (
                        <td
                          colSpan={RECALL_KS.length + 1}
                          className="px-3 py-3"
                        >
                          시간 예산을 넘겨 건너뛰었습니다.
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
