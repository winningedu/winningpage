// AI 호출 계기판 조회 상태. 입력 중인 필터(draft)와 조회에 적용된 필터(applied)를 나눈다.
import { addDaysYmd, ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";

export const AI_TELEMETRY_PAGE_SIZE = 20;
const DEFAULT_SPAN_DAYS = 29;

// 브라우저 시간대의 오늘과 29일 전을 YYYY-MM-DD 로 돌려준다. 서버는 to 날짜를 포함해 조회한다.
export function defaultRange(now: Date): { from: string; to: string } {
  const to = ymdIn(now, browserTimeZone());
  return { from: addDaysYmd(to, -DEFAULT_SPAN_DAYS), to };
}

export type AiTelemetryTab = "summary" | "calls" | "citations" | "pricing";

export type AiTelemetryFilters = {
  from: string;
  to: string;
  service: string;
  feature: string;
  status: string;
  retriedOnly: boolean;
  kind: string;
};

export type AiTelemetryQuery = {
  tab: AiTelemetryTab;
  draft: AiTelemetryFilters;
  applied: AiTelemetryFilters;
  page: number;
  pageSize: number;
};

export function createInitialQuery(now: Date): AiTelemetryQuery {
  const filters: AiTelemetryFilters = {
    ...defaultRange(now),
    service: "",
    feature: "",
    status: "",
    retriedOnly: false,
    kind: "",
  };
  return {
    tab: "summary",
    draft: filters,
    applied: filters,
    page: 1,
    pageSize: AI_TELEMETRY_PAGE_SIZE,
  };
}

export type AiTelemetryQueryAction =
  | { type: "setTab"; tab: AiTelemetryTab }
  | { type: "setRange"; from: string; to: string }
  | { type: "setService"; service: string }
  | { type: "setFeature"; feature: string }
  | { type: "setStatus"; status: string }
  | { type: "setRetriedOnly"; retriedOnly: boolean }
  | { type: "setKind"; kind: string }
  | { type: "setPage"; page: number }
  | { type: "submit" };

export function aiTelemetryQueryReducer(
  state: AiTelemetryQuery,
  action: AiTelemetryQueryAction,
): AiTelemetryQuery {
  switch (action.type) {
    case "setTab":
      return { ...state, tab: action.tab };
    case "setRange":
      return {
        ...state,
        draft: { ...state.draft, from: action.from, to: action.to },
      };
    case "setService":
      return { ...state, draft: { ...state.draft, service: action.service } };
    case "setFeature":
      return { ...state, draft: { ...state.draft, feature: action.feature } };
    case "setStatus":
      return { ...state, draft: { ...state.draft, status: action.status } };
    case "setRetriedOnly":
      return {
        ...state,
        draft: { ...state.draft, retriedOnly: action.retriedOnly },
      };
    case "setKind":
      return { ...state, draft: { ...state.draft, kind: action.kind } };
    case "setPage":
      return { ...state, page: Math.max(1, Math.floor(action.page)) };
    case "submit":
      return { ...state, applied: { ...state.draft }, page: 1 };
  }
}

function baseParams(view: string, f: AiTelemetryFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("view", view);
  params.set("from", f.from);
  params.set("to", f.to);
  return params;
}

export function buildSummarySearch(state: AiTelemetryQuery): string {
  const f = state.applied;
  const params = baseParams("summary", f);
  if (f.service) params.set("service", f.service);
  return params.toString();
}

export function buildCallsSearch(state: AiTelemetryQuery): string {
  const f = state.applied;
  const params = baseParams("calls", f);
  if (f.service) params.set("service", f.service);
  if (f.feature.trim()) params.set("feature", f.feature.trim());
  if (f.status) params.set("status", f.status);
  if (f.retriedOnly) params.set("retried", "1");
  if (f.kind) params.set("kind", f.kind);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params.toString();
}

export function buildCitationsSearch(state: AiTelemetryQuery): string {
  return baseParams("citations", state.applied).toString();
}
