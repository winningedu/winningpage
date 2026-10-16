import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { type PerQueryResult, postRun, type RunResponse } from "./api";
import ErrorBox from "./ErrorBox";
import {
  EMPTY_PARAM_DRAFT,
  type EvalParams,
  type KnowledgeType,
  PARAM_FIELDS,
  type ParamDraft,
  type RunMetrics,
  toParamOverrides,
} from "./form";
import { formatMetric, formatParams, RECALL_KS } from "./format";
import SweepSection from "./SweepSection";
import { Td, Th } from "./TableCells";
import useResourceTitles from "./useResourceTitles";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <div className="text-sm font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

function MetricCards({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="grid grid-cols-5 gap-3">
      {RECALL_KS.map((k) => (
        <StatCard
          key={k}
          label={`recall@${k}`}
          value={formatMetric(metrics.recall[k])}
        />
      ))}
      <StatCard label="MRR" value={formatMetric(metrics.mrr)} />
    </div>
  );
}

export default function RunTab({
  knowledgeType,
  productionParams,
  onSaved,
}: {
  knowledgeType: KnowledgeType;
  productionParams: EvalParams;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"hybrid" | "vector">("hybrid");
  const [params, setParams] = useState<ParamDraft>(EMPTY_PARAM_DRAFT);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<RunResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    const parsed = toParamOverrides(params);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await postRun({
      knowledgeType,
      mode,
      params: parsed.overrides,
      ...(note.trim() ? { note } : {}),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(response.message);
      return;
    }
    setResult(response.data);
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[9rem]">
            <Field label="모드">
              <Select
                value={mode}
                onChange={(value) => setMode(value as "hybrid" | "vector")}
              >
                <option value="hybrid">하이브리드</option>
                <option value="vector">벡터</option>
              </Select>
            </Field>
          </div>
          {PARAM_FIELDS.map(({ key, label }) => (
            <div key={key} className="w-[8rem]">
              <Field label={label}>
                <TextInput
                  value={params[key]}
                  onChange={(value) =>
                    setParams((prev) => ({ ...prev, [key]: value }))
                  }
                  placeholder={String(productionParams[key])}
                />
              </Field>
            </div>
          ))}
          <div className="w-[14rem]">
            <Field label="메모">
              <TextInput value={note} onChange={setNote} />
            </Field>
          </div>
          <ActionButton onClick={run} disabled={busy}>
            {busy ? "실행 중" : "실행"}
          </ActionButton>
        </div>
        <p className="mt-2 text-xs font-bold text-gray-500">
          빈 칸은 운영값(회색 글씨)으로 실행합니다. 벡터 모드는 RRF k 와
          가중치를 쓰지 않습니다.
        </p>
        {message && <ErrorBox message={message} />}
      </div>

      {result && <RunResult result={result} />}

      <SweepSection
        knowledgeType={knowledgeType}
        productionParams={productionParams}
        onSaved={onSaved}
      />
    </div>
  );
}

function PerQueryTable({ perQuery }: { perQuery: PerQueryResult[] }) {
  const titles = useResourceTitles(perQuery.flatMap((q) => q.expectedIds));
  const rows = perQuery.flatMap((q) =>
    q.expectedIds.map((id, index) => ({
      key: `${q.queryId}:${id}`,
      label: q.label,
      title: titles[id] ?? id,
      rank: q.ranks[index] ?? null,
    })),
  );
  return (
    <ScrollArea axis="x">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr className="border-y border-gray-300">
            <Th>질의</Th>
            <Th>기대 자료</Th>
            <Th>순위</Th>
            <Th>적중 여부</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-100">
              <td className="px-3 py-3 font-bold">{row.label}</td>
              <Td>{row.title}</Td>
              <Td>{row.rank ?? ""}</Td>
              <td
                className={`px-3 py-3 font-bold ${row.rank === null ? "text-red-600" : "text-blue-600"}`}
              >
                {row.rank === null ? "미적중" : "적중"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function RunResult({ result }: { result: RunResponse }) {
  return (
    <div className="space-y-4 bg-white p-6 shadow-sm">
      <div className="text-sm font-bold text-gray-500">
        질의 {result.queryCount}건 / {formatParams(result.params)}
      </div>
      <MetricCards metrics={result.metrics} />
      <PerQueryTable perQuery={result.perQuery} />
    </div>
  );
}
