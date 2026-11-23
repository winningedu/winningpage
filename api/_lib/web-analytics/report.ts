// Vercel Web Analytics 조회 API 로 방문 분석 보고서를 만든다(분석 grill Q12: B층은 우리 DB에 복사하지 않고 조회 API 로 읽는다).
// 엔드포인트와 인증: https://vercel.com/docs/analytics/web-analytics-api ,
// https://vercel.com/docs/rest-api/web-analytics/aggregates-custom-events (2026-11-23 확인).
// 사이트마다 Vercel 프로젝트가 달라 env 도 프로젝트별로 등록한다. 토큰은 응답과 로그에 싣지 않는다.

import { getEnv } from "../supabaseAdmin.js";

const API_BASE = "https://api.vercel.com/v1/query/web-analytics";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
const TOP_PAGES_LIMIT = 10;
const GROUP_LIMIT = 100;

// 서버가 Vercel 에서 읽는 이벤트와 속성(분석 grill Q12, 속성 최대 2개). 화면 표 순서이기도 하다.
// 수집 쪽 src/lib/analytics.ts 의 AnalyticsEventMap 과 같아야 한다(report.test.ts 가 잠금).
export const WEB_ANALYTICS_EVENTS = [
  { name: "signup_complete", properties: ["member_type"] },
  { name: "service_start", properties: ["service"] },
  { name: "diagnosis_complete", properties: [] },
  { name: "checkout_start", properties: ["method"] },
  { name: "payment_complete", properties: ["method"] },
  { name: "consult_apply", properties: [] },
  { name: "kakao_inquiry_click", properties: ["location"] },
  { name: "report_export", properties: ["service", "method"] },
  { name: "paywall_cta_click", properties: ["service", "location"] },
  { name: "ai_regenerate", properties: ["service", "step"] },
] as const;

export interface WebAnalyticsConfig {
  token: string;
  projectId: string;
  teamId: string;
}

export interface WebAnalyticsRange {
  from: string;
  to: string;
}

export interface WebAnalyticsReport {
  range: WebAnalyticsRange;
  totals: { pageviews: number; visitors: number };
  topPages: { path: string; pageviews: number; visitors: number }[];
  events: {
    name: string;
    count: number;
    visitors: number;
    breakdowns: {
      property: string;
      values: { value: string; count: number }[];
    }[];
  }[];
}

export class WebAnalyticsUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`vercel web analytics responded ${status}`);
  }
}

/** 세 값 중 하나라도 비면 null. */
export function readWebAnalyticsConfig(): WebAnalyticsConfig | null {
  const token = getEnv("VERCEL_ANALYTICS_TOKEN");
  const projectId = getEnv("VERCEL_ANALYTICS_PROJECT_ID");
  const teamId = getEnv("VERCEL_ANALYTICS_TEAM_ID");
  if (!token || !projectId || !teamId) return null;
  return { token, projectId, teamId };
}

// 날짜는 YYYY-MM-DD 한국 날짜다. 실제 달력에 없는 날이면 null.
function kstStartMs(date: string, plusDays: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const moment = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(moment.getTime())) return null;
  if (moment.toISOString().slice(0, 10) !== date) return null;
  moment.setUTCDate(moment.getUTCDate() + plusDays);
  return Date.parse(`${moment.toISOString().slice(0, 10)}T00:00:00+09:00`);
}

/** 시작일 0시(포함)부터 종료일 다음 날 0시 1ms 전(포함)까지. 틀리면 null. */
export function parseRange(
  from: unknown,
  to: unknown,
): { range: WebAnalyticsRange; since: number; until: number } | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const since = kstStartMs(from, 0);
  const nextDay = kstStartMs(to, 1);
  if (since === null || nextDay === null || since >= nextDay) return null;
  return { range: { from, to }, since, until: nextDay - 1 };
}

type Row = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

async function query(
  config: WebAnalyticsConfig,
  path: string,
  params: [string, string][],
): Promise<unknown> {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("projectId", config.projectId);
  url.searchParams.set("teamId", config.teamId);
  for (const [key, value] of params) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new WebAnalyticsUpstreamError(response.status);
  const body = (await response.json()) as { data?: unknown };
  return body.data;
}

function quoteList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(",");
}

async function buildReport(
  config: WebAnalyticsConfig,
  range: WebAnalyticsRange,
  since: number,
  until: number,
): Promise<WebAnalyticsReport> {
  const period: [string, string][] = [
    ["since", String(since)],
    ["until", String(until)],
  ];
  const eventNames = WEB_ANALYTICS_EVENTS.map((e) => e.name);
  const properties = [
    ...new Set(WEB_ANALYTICS_EVENTS.flatMap((e) => [...e.properties])),
  ];

  const [totals, pages, events, ...breakdowns] = await Promise.all([
    // visits/count 는 since, until 을 UTC 날짜 시작으로 내려 한국 하루 합계가 틀린다. 시간 단위를 지키는 aggregate 를 합산한다.
    query(config, "visits/aggregate", [...period, ["by", "environment"]]),
    query(config, "visits/aggregate", [
      ...period,
      ["by", "requestPath"],
      ["limit", String(TOP_PAGES_LIMIT)],
    ]),
    query(config, "events/aggregate", [
      ...period,
      ["by", "eventName"],
      ["limit", String(GROUP_LIMIT)],
      ["filter", `eventName in (${quoteList(eventNames)})`],
    ]),
    // 속성마다 한 번: 이벤트 이름과 그 속성 값 두 차원으로 나눈다.
    ...properties.map((property) =>
      query(config, "events/aggregate", [
        ...period,
        ["by", "eventName"],
        ["by", `eventData/${property}`],
        ["limit", String(GROUP_LIMIT)],
        [
          "filter",
          `eventName in (${quoteList(
            WEB_ANALYTICS_EVENTS.filter((e) =>
              (e.properties as readonly string[]).includes(property),
            ).map((e) => e.name),
          )})`,
        ],
      ]),
    ),
  ]);

  const totalRows = (Array.isArray(totals) ? totals : []) as Row[];
  const eventRows = (Array.isArray(events) ? events : []) as Row[];
  const breakdownRows = new Map(
    properties.map((property, i) => [
      property,
      (Array.isArray(breakdowns[i]) ? breakdowns[i] : []) as Row[],
    ]),
  );

  return {
    range,
    totals: {
      pageviews: totalRows.reduce((sum, r) => sum + num(r.pageviews), 0),
      visitors: totalRows.reduce((sum, r) => sum + num(r.visitors), 0),
    },
    topPages: ((Array.isArray(pages) ? pages : []) as Row[]).map((row) => ({
      path: String(row.requestPath ?? ""),
      pageviews: num(row.pageviews),
      visitors: num(row.visitors),
    })),
    events: WEB_ANALYTICS_EVENTS.map((event) => {
      const row = eventRows.find((r) => r.eventName === event.name);
      return {
        name: event.name,
        count: num(row?.count),
        visitors: num(row?.visitors),
        breakdowns: event.properties.map((property) => ({
          property,
          values: (breakdownRows.get(property) ?? [])
            .filter((r) => r.eventName === event.name)
            .map((r) => ({
              value: String(r.eventData ?? ""),
              count: num(r.count),
            })),
        })),
      };
    }),
  };
}

// 인스턴스 메모리 캐시. 프로젝트(사이트)와 기간별로 잠깐 들고 있어 조회 한도를 아낀다. 성공만 담는다.
const cache = new Map<string, { at: number; report: WebAnalyticsReport }>();

export async function loadWebAnalyticsReport(
  config: WebAnalyticsConfig,
  parsed: { range: WebAnalyticsRange; since: number; until: number },
): Promise<WebAnalyticsReport> {
  const key = `${config.projectId}:${parsed.range.from}:${parsed.range.to}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.report;

  const report = await buildReport(
    config,
    parsed.range,
    parsed.since,
    parsed.until,
  );
  cache.delete(key);
  cache.set(key, { at: now, report });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return report;
}
