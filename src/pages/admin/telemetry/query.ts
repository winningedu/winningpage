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
  applied: AiTelemetryFilters;
  page: number;
  pageSize: number;
};

const TABS: readonly AiTelemetryTab[] = [
  "summary",
  "calls",
  "citations",
  "pricing",
];

// 새로고침과 링크 공유로 같은 화면이 되도록 탭, 적용된 필터, 페이지는 주소 검색 파라미터에 둔다.
const PARAM = {
  tab: "tab",
  from: "from",
  to: "to",
  service: "service",
  feature: "feature",
  status: "status",
  retriedOnly: "retried",
  kind: "kind",
  page: "page",
} as const;

// from, to 가 주소에 없을 때만 기본 기간을 쓴다. 잘못된 탭과 페이지는 기본값으로 읽는다.
export function readQuery(
  params: URLSearchParams,
  now: Date,
): AiTelemetryQuery {
  const range = defaultRange(now);
  const tab = params.get(PARAM.tab);
  const page = Number(params.get(PARAM.page));
  return {
    tab: TABS.find((t) => t === tab) ?? "summary",
    applied: {
      from: params.get(PARAM.from) || range.from,
      to: params.get(PARAM.to) || range.to,
      service: params.get(PARAM.service) ?? "",
      feature: params.get(PARAM.feature) ?? "",
      status: params.get(PARAM.status) ?? "",
      retriedOnly: params.get(PARAM.retriedOnly) === "1",
      kind: params.get(PARAM.kind) ?? "",
    },
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: AI_TELEMETRY_PAGE_SIZE,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

// 조회를 누르면 필터를 주소에 적고 페이지는 1로 돌린다.
export function withFilters(
  params: URLSearchParams,
  f: AiTelemetryFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, PARAM.from, f.from.trim());
  setOrDelete(next, PARAM.to, f.to.trim());
  setOrDelete(next, PARAM.service, f.service);
  setOrDelete(next, PARAM.feature, f.feature.trim());
  setOrDelete(next, PARAM.status, f.status);
  setOrDelete(next, PARAM.retriedOnly, f.retriedOnly ? "1" : "");
  setOrDelete(next, PARAM.kind, f.kind);
  next.delete(PARAM.page);
  return next;
}

// 요약은 기본 탭이라 주소에서 비운다.
export function withTab(
  params: URLSearchParams,
  tab: AiTelemetryTab,
): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, PARAM.tab, tab === "summary" ? "" : tab);
  return next;
}

export function withPage(
  params: URLSearchParams,
  page: number,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const safe = Math.max(1, Math.floor(page));
  setOrDelete(next, PARAM.page, safe === 1 ? "" : String(safe));
  return next;
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
