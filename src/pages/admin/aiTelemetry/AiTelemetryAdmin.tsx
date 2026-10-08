import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT_SIZE } from "@/components/charts/chartTheme";
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
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type ApiResult,
  type CallItem,
  type CallsPage,
  type CitationItem,
  fetchCalls,
  fetchCitations,
  fetchPricing,
  fetchSummary,
  type PricingResponse,
  putPricing,
  type SummaryItem,
  type SummaryResponse,
} from "./aiTelemetryApi";
import {
  formatDate,
  formatInt,
  formatMs,
  formatPercent,
  formatUsd,
  KIND_OPTIONS,
  SERVICE_OPTIONS,
  STATUS_OPTIONS,
  serviceLabel,
} from "./aiTelemetryFormat";
import {
  emptyPricingRow,
  fromPricing,
  MODEL_PLACEHOLDERS,
  type PricingRow,
  toPricingBody,
} from "./aiTelemetryPricingForm";
import {
  type AiTelemetryTab,
  aiTelemetryQueryReducer,
  buildCallsSearch,
  buildCitationsSearch,
  buildSummarySearch,
  createInitialQuery,
} from "./aiTelemetryQuery";

const TABS: { key: AiTelemetryTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "calls", label: "호출 목록" },
  { key: "citations", label: "자료 인용" },
  { key: "pricing", label: "단가" },
];

// 서비스별 선 색. 서비스 순서대로 돌려 쓴다.
const SERIES_COLORS = [
  CHART_COLORS.line,
  "#1D63B3",
  "#2E8B57",
  "#B88737",
  "#8B3A62",
  "#5AA6F0",
];

const NO_DATA = "자료 없음";

type Remote<T> = { data: T | null; loading: boolean; error: string };

// 탭이 켜져 있고 fetcher 가 바뀔 때 다시 불러온다.
function useRemote<T>(
  enabled: boolean,
  fetcher: () => Promise<ApiResult<T>>,
): Remote<T> {
  const [state, setState] = useState<Remote<T>>({
    data: null,
    loading: false,
    error: "",
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    fetcher().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ data: null, loading: false, error: result.message });
        return;
      }
      setState({ data: result.data, loading: false, error: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher]);
  return state;
}

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function AiTelemetryAdmin({ config }: Props) {
  const [query, dispatch] = useReducer(aiTelemetryQueryReducer, undefined, () =>
    createInitialQuery(new Date()),
  );
  const { tab, draft } = query;

  const summarySearch = buildSummarySearch(query);
  const callsSearch = buildCallsSearch(query);
  const citationsSearch = buildCitationsSearch(query);

  const summary = useRemote<SummaryResponse>(
    tab === "summary",
    useCallback(() => fetchSummary(summarySearch), [summarySearch]),
  );
  const calls = useRemote<CallsPage>(
    tab === "calls",
    useCallback(() => fetchCalls(callsSearch), [callsSearch]),
  );
  const citations = useRemote<CitationItem[]>(
    tab === "citations",
    useCallback(() => fetchCitations(citationsSearch), [citationsSearch]),
  );
  const pricing = useRemote<PricingResponse>(tab === "pricing", fetchPricing);

  const active =
    tab === "summary"
      ? summary
      : tab === "calls"
        ? calls
        : tab === "citations"
          ? citations
          : pricing;

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <ActionButton
              key={t.key}
              variant={t.key === tab ? "dark" : "light"}
              onClick={() => dispatch({ type: "setTab", tab: t.key })}
            >
              {t.label}
            </ActionButton>
          ))}
        </div>

        {tab !== "pricing" && (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: "submit" });
            }}
          >
            <div className="w-[10rem]">
              <Field label="시작일">
                <TextInput
                  value={draft.from}
                  onChange={(from) =>
                    dispatch({ type: "setRange", from, to: draft.to })
                  }
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label="종료일">
                <TextInput
                  value={draft.to}
                  onChange={(to) =>
                    dispatch({ type: "setRange", from: draft.from, to })
                  }
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </div>
            {tab !== "citations" && (
              <div className="w-[10rem]">
                <Field label="서비스">
                  <Select
                    value={draft.service}
                    onChange={(service) =>
                      dispatch({ type: "setService", service })
                    }
                  >
                    <option value="">전체</option>
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {tab === "calls" && (
              <>
                <div className="w-[12rem]">
                  <Field label="기능">
                    <TextInput
                      value={draft.feature}
                      onChange={(feature) =>
                        dispatch({ type: "setFeature", feature })
                      }
                    />
                  </Field>
                </div>
                <div className="w-[8rem]">
                  <Field label="상태">
                    <Select
                      value={draft.status}
                      onChange={(status) =>
                        dispatch({ type: "setStatus", status })
                      }
                    >
                      <option value="">전체</option>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="w-[8rem]">
                  <Field label="종류">
                    <Select
                      value={draft.kind}
                      onChange={(kind) => dispatch({ type: "setKind", kind })}
                    >
                      <option value="">전체</option>
                      {KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <label className="flex h-10 items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={draft.retriedOnly}
                    onChange={(e) =>
                      dispatch({
                        type: "setRetriedOnly",
                        retriedOnly: e.target.checked,
                      })
                    }
                  />
                  재요청만
                </label>
              </>
            )}
            <ActionButton type="submit">조회</ActionButton>
          </form>
        )}
        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {active.error && (
        <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {active.error}
        </div>
      )}

      {active.loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <>
          {tab === "summary" && summary.data && (
            <SummaryPanel data={summary.data} />
          )}
          {tab === "calls" && calls.data && (
            <CallsPanel
              data={calls.data}
              page={query.page}
              pageSize={query.pageSize}
              onPage={(page) => dispatch({ type: "setPage", page })}
            />
          )}
          {tab === "citations" && citations.data && (
            <CitationsPanel items={citations.data} />
          )}
          {tab === "pricing" && pricing.data && (
            <PricingPanel initial={pricing.data} />
          )}
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-3 text-left">{children}</th>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <div className="text-sm font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-black">{value || NO_DATA}</div>
    </div>
  );
}

function formatNullableInt(value: number | null): string {
  return value === null ? "" : formatInt(value);
}

type ChartRow = Record<string, string | number | null>;

function buildCallsChart(items: SummaryItem[]) {
  const services = [...new Set(items.map((i) => i.service))].sort();
  const byDay = new Map<string, ChartRow>();
  for (const item of items) {
    const row = byDay.get(item.day) ?? { day: item.day };
    row[item.service] = item.calls;
    byDay.set(item.day, row);
  }
  const rows = [...byDay.values()].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );
  return { services, rows };
}

// 일별 금액 합계. 그날 단가가 없는 모델이 섞였으면 합계를 만들지 않고 비워 둔다.
function buildCostChart(items: SummaryItem[]): ChartRow[] {
  const byDay = new Map<string, number | null>();
  for (const item of items) {
    const prev = byDay.get(item.day);
    if (prev === null || item.costUsd === null) {
      byDay.set(item.day, null);
    } else {
      byDay.set(item.day, (prev ?? 0) + item.costUsd);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, costUsd]) => ({ day, costUsd }));
}

function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-gray-200 p-4">
      <div className="mb-2 text-sm font-black">{title}</div>
      <div className="h-[16rem]">{children}</div>
    </div>
  );
}

function SummaryPanel({ data }: { data: SummaryResponse }) {
  const { totals, items } = data;
  const calls = useMemo(() => buildCallsChart(items), [items]);
  const cost = useMemo(() => buildCostChart(items), [items]);
  const axis = {
    axisLine: false,
    tickLine: false,
    tick: { fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE },
  };

  return (
    <div className="space-y-4">
      {!data.pricingConfigured && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          단가가 없어 금액은 비워 둡니다. 단가 탭에서 입력하세요.
        </div>
      )}
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="호출 수" value={formatInt(totals.calls)} />
        <StatCard label="실패율" value={formatPercent(totals.failureRate)} />
        <StatCard label="재요청률" value={formatPercent(totals.retryRate)} />
        <StatCard
          label="캐시 토큰 비율"
          value={formatPercent(totals.cachedRatio)}
        />
        <StatCard label="p95 ms" value={formatMs(totals.p95Ms)} />
        <StatCard label="금액 USD" value={formatUsd(totals.costUsd)} />
      </div>

      {items.length === 0 ? (
        <div className="bg-white p-12 text-center text-sm text-gray-400 shadow-sm">
          조회된 호출이 없습니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <ChartBox title="일별 호출 수">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calls.rows}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis width={40} {...axis} />
                  <Tooltip />
                  {calls.services.map((service, i) => (
                    <Line
                      key={service}
                      dataKey={service}
                      name={serviceLabel(service)}
                      stroke={
                        SERIES_COLORS[i % SERIES_COLORS.length] ??
                        CHART_COLORS.line
                      }
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
            <ChartBox title="일별 금액 합계 USD">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cost}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis width={48} {...axis} />
                  <Tooltip />
                  <Line
                    dataKey="costUsd"
                    name="금액 USD"
                    stroke={CHART_COLORS.line}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>

          <div className="mt-6">
            <ScrollArea axis="x">
              <table className="w-full min-w-[80rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <Th>일</Th>
                    <Th>서비스</Th>
                    <Th>호출</Th>
                    <Th>실패율</Th>
                    <Th>재요청률</Th>
                    <Th>prompt</Th>
                    <Th>output</Th>
                    <Th>cached</Th>
                    <Th>thoughts</Th>
                    <Th>캐시 비율</Th>
                    <Th>p50 ms</Th>
                    <Th>p95 ms</Th>
                    <Th>금액 USD</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={`${row.day}-${row.service}`}
                      className="border-b border-gray-100"
                    >
                      <td className="px-3 py-3">{row.day}</td>
                      <td className="px-3 py-3">{serviceLabel(row.service)}</td>
                      <td className="px-3 py-3">{formatInt(row.calls)}</td>
                      <td className="px-3 py-3">
                        {formatPercent(row.failureRate)}
                      </td>
                      <td className="px-3 py-3">
                        {formatPercent(row.retryRate)}
                      </td>
                      <td className="px-3 py-3">
                        {formatInt(row.promptTokens)}
                      </td>
                      <td className="px-3 py-3">
                        {formatInt(row.outputTokens)}
                      </td>
                      <td className="px-3 py-3">
                        {formatInt(row.cachedTokens)}
                      </td>
                      <td className="px-3 py-3">
                        {formatInt(row.thoughtsTokens)}
                      </td>
                      <td className="px-3 py-3">
                        {formatPercent(row.cachedRatio)}
                      </td>
                      <td className="px-3 py-3">{formatMs(row.p50Ms)}</td>
                      <td className="px-3 py-3">{formatMs(row.p95Ms)}</td>
                      <td className="px-3 py-3">{formatUsd(row.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

function CallsPanel({
  data,
  page,
  pageSize,
  onPage,
}: {
  data: CallsPage;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const [selected, setSelected] = useState<CallItem | null>(null);
  const lastPage = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 text-sm font-bold text-gray-500">
        전체 <span className="text-blue-600">{data.total}</span>건
      </div>
      <ScrollArea axis="x">
        <table className="w-full min-w-[80rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <Th>시각</Th>
              <Th>서비스</Th>
              <Th>기능</Th>
              <Th>단계</Th>
              <Th>호출</Th>
              <Th>모델</Th>
              <Th>시도</Th>
              <Th>전송 시도</Th>
              <Th>상태</Th>
              <Th>finish</Th>
              <Th>prompt</Th>
              <Th>output</Th>
              <Th>cached</Th>
              <Th>지연 ms</Th>
              <Th>검증</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-gray-400">
                  조회된 호출이 없습니다.
                </td>
              </tr>
            ) : (
              data.items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-3">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-3">{serviceLabel(row.service)}</td>
                  <td className="px-3 py-3">{row.feature}</td>
                  <td className="px-3 py-3">{row.step ?? ""}</td>
                  <td className="px-3 py-3">{row.callKey ?? ""}</td>
                  <td className="px-3 py-3">{row.model}</td>
                  <td className="px-3 py-3">{row.attempt}</td>
                  <td className="px-3 py-3">{row.transportAttempt ?? ""}</td>
                  <td
                    className={`px-3 py-3 font-bold ${row.status === "error" ? "text-red-600" : ""}`}
                  >
                    {row.status}
                  </td>
                  <td className="px-3 py-3">{row.finishReason ?? ""}</td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.prompt)}
                  </td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.output)}
                  </td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.cached)}
                  </td>
                  <td className="px-3 py-3">{formatMs(row.latencyMs)}</td>
                  <td className="px-3 py-3">{row.validation ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
        <ActionButton
          variant="light"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          이전
        </ActionButton>
        <span>
          {page} / {lastPage}
        </span>
        <ActionButton
          variant="light"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          다음
        </ActionButton>
      </div>

      <CallDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CallDetailDialog({
  row,
  onClose,
}: {
  row: CallItem | null;
  onClose: () => void;
}) {
  const fields: [string, string][] = row
    ? [
        ["traceId", row.traceId ?? ""],
        ["callKey", row.callKey ?? ""],
        ["targetKind", row.targetKind ?? ""],
        ["targetId", row.targetId ?? ""],
        ["profileId", row.profileId ?? ""],
        ["promptVersion", row.promptVersion ?? ""],
        ["retryReason", row.retryReason ?? ""],
        ["errorCode", row.errorCode ?? ""],
        ["errorMessage", row.errorMessage ?? ""],
        ["issueCodes", row.issueCodes.join(", ")],
        ["inputChars", formatNullableInt(row.inputChars)],
        ["outputChars", formatNullableInt(row.outputChars)],
        ["thoughts", formatNullableInt(row.tokens.thoughts)],
        ["total", formatNullableInt(row.tokens.total)],
      ]
    : [];

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[36rem]">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>
                {serviceLabel(row.service)} {row.feature}
              </DialogTitle>
              <DialogDescription>
                {formatDate(row.createdAt)} / {row.model}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y divide-gray-100 border border-gray-200 text-sm">
              {fields.map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <dt className="w-[9rem] shrink-0 font-black text-gray-500">
                    {label}
                  </dt>
                  <dd className="min-w-0 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CitationsPanel({ items }: { items: CitationItem[] }) {
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        order === "asc"
          ? a.citedCount - b.citedCount
          : b.citedCount - a.citedCount,
      ),
    [items, order],
  );

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-bold text-gray-500">
          전체 <span className="text-blue-600">{items.length}</span>건
        </span>
        <ActionButton
          variant="light"
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
        >
          {order === "asc" ? "인용 적은 순" : "인용 많은 순"}
        </ActionButton>
      </div>
      <ScrollArea axis="x">
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <Th>자료명</Th>
              <Th>유형</Th>
              <Th>활성</Th>
              <Th>적중 횟수</Th>
              <Th>인용 횟수</Th>
              <Th>마지막 적중</Th>
              <Th>마지막 인용</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  조회된 자료가 없습니다.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.resourceId}
                  className={`border-b border-gray-100 ${row.isActive ? "" : "text-gray-400"}`}
                >
                  <td className="px-3 py-3 font-bold">{row.title}</td>
                  <td className="px-3 py-3">{row.knowledgeType}</td>
                  <td className="px-3 py-3">
                    {row.isActive ? "활성" : "비활성"}
                  </td>
                  <td className="px-3 py-3">{formatInt(row.hitCount)}</td>
                  <td className="px-3 py-3">{formatInt(row.citedCount)}</td>
                  <td className="px-3 py-3">{formatDate(row.lastHitAt)}</td>
                  <td className="px-3 py-3">{formatDate(row.lastCitedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function PricingPanel({ initial }: { initial: PricingResponse }) {
  const [rows, setRows] = useState<PricingRow[]>(() =>
    initial.pricing && Object.keys(initial.pricing).length > 0
      ? fromPricing(initial.pricing)
      : [emptyPricingRow()],
  );
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function patch(index: number, change: Partial<PricingRow>) {
    setSaved(false);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...change } : r)),
    );
  }

  async function save() {
    if (busy) return;
    const body = toPricingBody(rows);
    if (!body.ok) {
      setError(body.message);
      setSaved(false);
      return;
    }
    setBusy(true);
    setError("");
    const result = await putPricing(body.pricing);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setSaved(false);
      return;
    }
    setRows(fromPricing(result.data.pricing));
    setUpdatedAt(new Date().toISOString());
    setSaved(true);
  }

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 text-sm font-bold text-gray-500">
        모델별 단가(USD per 1M 토큰). 마지막 저장{" "}
        {formatDate(updatedAt) || NO_DATA}
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          // 행은 순서가 곧 정체성이고 중간 삽입이 없어 index 키를 쓴다.
          // biome-ignore lint/suspicious/noArrayIndexKey: 행 정체성이 순서뿐이다
          <div key={index} className="flex items-end gap-3">
            <div className="w-[16rem]">
              <Field label={index === 0 ? "모델명" : ""}>
                <TextInput
                  value={row.model}
                  onChange={(model) => patch(index, { model })}
                  placeholder={MODEL_PLACEHOLDERS[index] ?? ""}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "입력" : ""}>
                <TextInput
                  value={row.input}
                  onChange={(input) => patch(index, { input })}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "캐시 입력" : ""}>
                <TextInput
                  value={row.cachedInput}
                  onChange={(cachedInput) => patch(index, { cachedInput })}
                />
              </Field>
            </div>
            <div className="w-[10rem]">
              <Field label={index === 0 ? "출력" : ""}>
                <TextInput
                  value={row.output}
                  onChange={(output) => patch(index, { output })}
                />
              </Field>
            </div>
            <ActionButton
              variant="light"
              onClick={() => {
                setSaved(false);
                setRows((prev) => prev.filter((_, i) => i !== index));
              }}
            >
              삭제
            </ActionButton>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
          단가를 저장했습니다.
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <ActionButton
          variant="light"
          onClick={() => setRows((prev) => [...prev, emptyPricingRow()])}
        >
          행 추가
        </ActionButton>
        <ActionButton onClick={save} disabled={busy}>
          {busy ? "저장 중..." : "저장"}
        </ActionButton>
      </div>
    </div>
  );
}
