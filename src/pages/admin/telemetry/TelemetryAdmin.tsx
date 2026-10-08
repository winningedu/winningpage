import { useCallback, useEffect, useReducer, useState } from "react";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type ApiResult,
  type CallsPage,
  type CitationItem,
  fetchCalls,
  fetchCitations,
  fetchPricing,
  fetchSummary,
  type PricingResponse,
  type SummaryResponse,
} from "./api";
import CallsTab from "./CallsTab";
import CitationsTab from "./CitationsTab";
import { KIND_OPTIONS, SERVICE_OPTIONS, STATUS_OPTIONS } from "./format";
import PricingTab from "./PricingTab";
import {
  type AiTelemetryTab,
  aiTelemetryQueryReducer,
  buildCallsSearch,
  buildCitationsSearch,
  buildSummarySearch,
  createInitialQuery,
} from "./query";
import SummaryTab from "./SummaryTab";

const TABS: { key: AiTelemetryTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "calls", label: "호출 목록" },
  { key: "citations", label: "자료 인용" },
  { key: "pricing", label: "단가" },
];

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

export default function TelemetryAdmin({ config }: Props) {
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
            <SummaryTab data={summary.data} />
          )}
          {tab === "calls" && calls.data && (
            <CallsTab
              data={calls.data}
              page={query.page}
              pageSize={query.pageSize}
              onPage={(page) => dispatch({ type: "setPage", page })}
            />
          )}
          {tab === "citations" && citations.data && (
            <CitationsTab items={citations.data} />
          )}
          {tab === "pricing" && pricing.data && (
            <PricingTab initial={pricing.data} />
          )}
        </>
      )}
    </div>
  );
}
