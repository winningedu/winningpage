import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ActionButton,
  Field,
  Select,
  Textarea,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type EvalRun,
  fetchResourceTitles,
  fetchRuns,
  type GoldenQuery,
  listGoldenQueries,
  type PerQueryResult,
  postRun,
  postSweep,
  type RunResponse,
  type RunsResponse,
  type SweepResponse,
  saveGoldenQuery,
  searchKnowledgeResources,
  setGoldenQueryActive,
} from "./knowledgeEvalsApi";
import {
  diffMetrics,
  EMPTY_GOLDEN_DRAFT,
  EMPTY_PARAM_DRAFT,
  type EvalParams,
  type ExpectedResource,
  type GoldenDraft,
  isSameParams,
  type KnowledgeType,
  PARAM_FIELDS,
  type ParamDraft,
  type RunMetrics,
  type SweepDraft,
  sortSweepItems,
  toGoldenRow,
  toParamOverrides,
  toSweepGrid,
} from "./knowledgeEvalsForm";

type Tab = "golden" | "run" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "golden", label: "기준 문제집" },
  { key: "run", label: "평가 실행" },
  { key: "history", label: "이력" },
];

const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: "topic_pattern", label: "수행 주제" },
  { value: "verified_resource", label: "수행 자료" },
];

const RECALL_KS = ["1", "3", "5", "10"];

const GUIDE =
  "문제집은 30문항부터 시작하고, 운영 검색 설정 변경은 이 결과를 근거로 별도로 결정합니다.";

function formatMetric(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "";
}

function formatDiff(value: number | null): string {
  if (value === null) return "";
  const text = value.toFixed(3);
  return value > 0 ? `+${text}` : text;
}

function formatParams(params: EvalParams): string {
  return `k ${params.rrfK} / 단어 ${params.fullTextWeight} / 의미 ${params.semanticWeight} / threshold ${params.matchThreshold} / match_count ${params.matchCount}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function Th({ children }: { children?: ReactNode }) {
  return <th className="px-3 py-3 text-left">{children}</th>;
}

function Td({ children }: { children?: ReactNode }) {
  return <td className="px-3 py-3">{children}</td>;
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
      {message}
    </div>
  );
}

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

// 기대 자료 id 의 제목을 모아 불러온다. ids 문자열이 바뀔 때만 다시 부른다.
function useResourceTitles(ids: string[]): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchResourceTitles(key.split(",")).then((result) => {
      if (!cancelled && result.ok) setTitles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return titles;
}

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function KnowledgeEvalsAdmin({ config }: Props) {
  const [tab, setTab] = useState<Tab>("golden");
  const [knowledgeType, setKnowledgeType] =
    useState<KnowledgeType>("topic_pattern");
  const [runs, setRuns] = useState<RunsResponse | null>(null);
  const [runsError, setRunsError] = useState("");

  const reloadRuns = useCallback(() => {
    fetchRuns(knowledgeType).then((result) => {
      if (!result.ok) {
        setRunsError(result.message);
        return;
      }
      setRunsError("");
      setRuns(result.data);
    });
  }, [knowledgeType]);

  useEffect(() => {
    reloadRuns();
  }, [reloadRuns]);

  const productionParams = runs?.productionParams[knowledgeType] ?? null;

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {TABS.map((t) => (
              <ActionButton
                key={t.key}
                variant={t.key === tab ? "dark" : "light"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </ActionButton>
            ))}
          </div>
          <div className="w-[10rem]">
            <Field label="지식 유형">
              <Select
                value={knowledgeType}
                onChange={(value) => setKnowledgeType(value as KnowledgeType)}
              >
                {KNOWLEDGE_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
        <p className="mt-1 text-sm font-bold text-gray-500">{GUIDE}</p>
      </div>

      {tab === "golden" && (
        <GoldenPanel key={knowledgeType} knowledgeType={knowledgeType} />
      )}
      {tab === "run" && (
        <>
          <ErrorBox message={runsError} />
          {productionParams && (
            <RunPanel
              key={knowledgeType}
              knowledgeType={knowledgeType}
              productionParams={productionParams}
              onSaved={reloadRuns}
            />
          )}
        </>
      )}
      {tab === "history" && (
        <>
          <ErrorBox message={runsError} />
          {runs && <HistoryPanel key={knowledgeType} runs={runs.items} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 기준 문제집

function GoldenPanel({ knowledgeType }: { knowledgeType: KnowledgeType }) {
  const [items, setItems] = useState<GoldenQuery[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<GoldenQuery | "new" | null>(null);

  const reload = useCallback(() => {
    listGoldenQueries(knowledgeType).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setItems(result.data);
    });
  }, [knowledgeType]);

  useEffect(() => {
    reload();
  }, [reload]);

  const titles = useResourceTitles(
    (items ?? []).flatMap((item) => item.expected_resource_ids),
  );
  const activeCount = (items ?? []).filter((item) => item.is_active).length;

  async function toggleActive(item: GoldenQuery) {
    const result = await setGoldenQueryActive(item.id, !item.is_active);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    reload();
  }

  return (
    <div className="bg-white p-6 shadow-sm">
      <ErrorBox message={error} />
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-bold text-gray-500">
          활성 <span className="text-blue-600">{activeCount}</span>문항
        </span>
        <ActionButton onClick={() => setEditing("new")}>질의 추가</ActionButton>
      </div>
      <ScrollArea axis="x">
        <table className="w-full min-w-[70rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <Th>학년</Th>
              <Th>과목</Th>
              <Th>진로</Th>
              <Th>주제</Th>
              <Th>기대 자료 수</Th>
              <Th>활성</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  등록된 질의가 없습니다.
                </td>
              </tr>
            ) : (
              (items ?? []).map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 ${item.is_active ? "" : "text-gray-400"}`}
                >
                  <Td>{item.grade}</Td>
                  <Td>{item.subject}</Td>
                  <Td>{item.career}</Td>
                  <td className="px-3 py-3 font-bold">{item.selected_topic}</td>
                  <td
                    className="px-3 py-3"
                    title={item.expected_resource_ids
                      .map((id) => titles[id] ?? id)
                      .join("\n")}
                  >
                    {item.expected_resource_ids.length}
                  </td>
                  <Td>{item.is_active ? "활성" : "비활성"}</Td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <ActionButton
                        variant="light"
                        onClick={() => setEditing(item)}
                      >
                        편집
                      </ActionButton>
                      <ActionButton
                        variant={item.is_active ? "danger" : "light"}
                        onClick={() => toggleActive(item)}
                      >
                        {item.is_active ? "비활성" : "다시 활성"}
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
      {editing !== null && (
        <GoldenDialog
          knowledgeType={knowledgeType}
          target={editing === "new" ? null : editing}
          titles={titles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function draftFrom(
  target: GoldenQuery | null,
  titles: Record<string, string>,
): GoldenDraft {
  if (!target) return EMPTY_GOLDEN_DRAFT;
  return {
    grade: target.grade,
    subject: target.subject,
    career: target.career ?? "",
    selectedTopic: target.selected_topic ?? "",
    assessmentInfo: target.assessment_info ?? "",
    note: target.note ?? "",
    expected: target.expected_resource_ids.map((id) => ({
      id,
      title: titles[id] ?? id,
    })),
  };
}

function GoldenDialog({
  knowledgeType,
  target,
  titles,
  onClose,
  onSaved,
}: {
  knowledgeType: KnowledgeType;
  target: GoldenQuery | null;
  titles: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GoldenDraft>(() =>
    draftFrom(target, titles),
  );
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ExpectedResource[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Omit<GoldenDraft, "expected">) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  async function search() {
    const result = await searchKnowledgeResources(knowledgeType, term);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setResults(result.data);
  }

  function addExpected(resource: ExpectedResource) {
    setDraft((prev) =>
      prev.expected.some((item) => item.id === resource.id)
        ? prev
        : { ...prev, expected: [...prev.expected, resource] },
    );
  }

  function removeExpected(id: string) {
    setDraft((prev) => ({
      ...prev,
      expected: prev.expected.filter((item) => item.id !== id),
    }));
  }

  async function submit() {
    if (busy) return;
    const parsed = toGoldenRow(knowledgeType, draft);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setBusy(true);
    const result = await saveGoldenQuery(target?.id ?? null, parsed.row);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[44rem]">
        <DialogHeader>
          <DialogTitle>{target ? "질의 편집" : "질의 추가"}</DialogTitle>
          <DialogDescription>
            학생이 입력하는 값과 같은 칸입니다. 기대 자료는 이 질의에 나와야 할
            지식 항목입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Field label="학년">
            <TextInput
              value={draft.grade}
              onChange={set("grade")}
              placeholder="고2"
            />
          </Field>
          <Field label="과목">
            <TextInput value={draft.subject} onChange={set("subject")} />
          </Field>
          <Field label="진로">
            <TextInput value={draft.career} onChange={set("career")} />
          </Field>
        </div>
        <Field label="주제">
          <TextInput
            value={draft.selectedTopic}
            onChange={set("selectedTopic")}
          />
        </Field>
        <Field label="수행평가 안내문">
          <Textarea
            value={draft.assessmentInfo}
            onChange={set("assessmentInfo")}
          />
        </Field>
        <Field label="메모">
          <TextInput value={draft.note} onChange={set("note")} />
        </Field>

        <div>
          <div className="mb-1 text-xs font-black text-gray-500">기대 자료</div>
          <ul className="mb-2 space-y-1">
            {draft.expected.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-bold"
              >
                <span>{item.title}</span>
                <ActionButton
                  variant="light"
                  onClick={() => removeExpected(item.id)}
                >
                  빼기
                </ActionButton>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <TextInput
              value={term}
              onChange={setTerm}
              placeholder="자료 제목 검색"
            />
            <ActionButton type="submit" variant="light">
              검색
            </ActionButton>
          </form>
          {results && (
            <ScrollArea className="mt-2 max-h-[14rem]">
              {results.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <ul className="space-y-1">
                  {results.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-3 py-1 text-sm"
                    >
                      <span>{item.title}</span>
                      <ActionButton
                        variant="light"
                        onClick={() => addExpected(item)}
                      >
                        추가
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          )}
        </div>

        {message && (
          <div className="text-sm font-bold text-red-600">{message}</div>
        )}
        <div className="flex justify-end gap-2">
          <ActionButton variant="light" onClick={onClose}>
            취소
          </ActionButton>
          <ActionButton onClick={submit} disabled={busy}>
            저장
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 평가 실행

function RunPanel({
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

      <SweepPanel
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

const EMPTY_SWEEP_DRAFT: SweepDraft = {
  rrfK: "",
  weights: "",
  matchThreshold: "",
};

function SweepPanel({
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

// ---------------------------------------------------------------------------
// 이력

function HistoryPanel({ runs }: { runs: EvalRun[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id].slice(-2),
    );
  }

  // 비교는 앞 실행(오래된 쪽)에서 뒤 실행으로 본다.
  const picked = runs
    .filter((run) => selected.includes(run.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [before, after] = picked;

  return (
    <div className="space-y-6">
      {before && after && (
        <div className="bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black">두 실행 비교</h2>
          <div className="mt-1 text-xs font-bold text-gray-500">
            앞 {formatDate(before.created_at)} / 뒤{" "}
            {formatDate(after.created_at)}
          </div>
          <table className="mt-4 w-full max-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-300">
                <Th>지표</Th>
                <Th>앞 실행</Th>
                <Th>뒤 실행</Th>
                <Th>차이</Th>
              </tr>
            </thead>
            <tbody>
              {diffMetrics(before.metrics, after.metrics).map((row) => (
                <tr key={row.label} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-bold">{row.label}</td>
                  <Td>{formatMetric(row.before)}</Td>
                  <Td>{formatMetric(row.after)}</Td>
                  <td
                    className={`px-3 py-3 font-bold ${(row.diff ?? 0) > 0 ? "text-blue-600" : (row.diff ?? 0) < 0 ? "text-red-600" : ""}`}
                  >
                    {formatDiff(row.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white p-6 shadow-sm">
        <div className="mb-4 text-sm font-bold text-gray-500">
          최근 실행 {runs.length}건 / 두 건을 고르면 지표 차이를 보여 줍니다.
        </div>
        <ScrollArea axis="x">
          <table className="w-full min-w-[80rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-300">
                <Th>비교</Th>
                <Th>실행 시각</Th>
                <Th>모드</Th>
                <Th>파라미터</Th>
                <Th>질의 수</Th>
                {RECALL_KS.map((k) => (
                  <Th key={k}>recall@{k}</Th>
                ))}
                <Th>MRR</Th>
                <Th>메모</Th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    실행 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id} className="border-b border-gray-100">
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`${formatDate(run.created_at)} 실행 비교`}
                        checked={selected.includes(run.id)}
                        onChange={() => toggle(run.id)}
                      />
                    </Td>
                    <Td>{formatDate(run.created_at)}</Td>
                    <Td>{run.mode === "hybrid" ? "하이브리드" : "벡터"}</Td>
                    <Td>{formatParams(run.params)}</Td>
                    <Td>{run.query_count}</Td>
                    {RECALL_KS.map((k) => (
                      <Td key={k}>{formatMetric(run.metrics.recall[k])}</Td>
                    ))}
                    <Td>{formatMetric(run.metrics.mrr)}</Td>
                    <Td>{run.note}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}
