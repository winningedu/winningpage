// 관리자 AI 텔레메트리 조회(GET /api/admin/ai-telemetry)의 쿼리 파싱 규칙.
// 날짜는 KST(+09:00 고정) 달력 날짜로 받고, 조회 구간은 [from, to) 로 바꾼다.

export const AI_SERVICES = [
  "performance",
  "growth",
  "inquiry",
  "selfeval",
  "goal",
] as const;
export type AiService = (typeof AI_SERVICES)[number];

export const AI_VIEWS = ["summary", "calls", "citations", "pricing"] as const;
export type AiView = (typeof AI_VIEWS)[number];

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_FEATURE_LENGTH = 64;

type RawQuery = Record<string, unknown>;

function first(v: unknown): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" ? x : undefined;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function kstDateString(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

// 'YYYY-MM-DD' 를 그 날짜의 KST 0시(Date)로 바꾼다. 달력에 없는 날짜는 null.
function kstMidnight(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return kstDateString(d) === s ? d : null;
}

export function parseRange(
  query: RawQuery,
  now: Date,
): { ok: true; from: Date; to: Date } | { ok: false; reason: string } {
  const today = kstMidnight(kstDateString(now));
  if (!today) return { ok: false, reason: "현재 시각을 해석하지 못했습니다." };

  const toRaw = first(query.to);
  const fromRaw = first(query.from);
  const toDay = toRaw ? kstMidnight(toRaw) : today;
  if (!toDay) return { ok: false, reason: "to 가 올바르지 않습니다." };
  const fromDay = fromRaw
    ? kstMidnight(fromRaw)
    : new Date(toDay.getTime() - (DEFAULT_DAYS - 1) * DAY_MS);
  if (!fromDay) return { ok: false, reason: "from 이 올바르지 않습니다." };

  if (fromDay.getTime() > toDay.getTime())
    return { ok: false, reason: "from 은 to 보다 뒤일 수 없습니다." };
  const days = Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS) + 1;
  if (days > MAX_DAYS)
    return { ok: false, reason: `조회 기간은 ${MAX_DAYS}일 이하여야 합니다.` };

  return { ok: true, from: fromDay, to: new Date(toDay.getTime() + DAY_MS) };
}

export function parseServiceFilter(
  value: unknown,
): { ok: true; service: AiService | null } | { ok: false; reason: string } {
  const v = first(value);
  if (v === undefined || v === "") return { ok: true, service: null };
  if (!(AI_SERVICES as readonly string[]).includes(v))
    return { ok: false, reason: "service 가 올바르지 않습니다." };
  return { ok: true, service: v as AiService };
}

export function parseView(value: unknown): AiView | null {
  const v = first(value);
  if (v === undefined || v === "") return "summary";
  return (AI_VIEWS as readonly string[]).includes(v) ? (v as AiView) : null;
}

export type CallsQuery = {
  from: Date;
  to: Date;
  service: AiService | null;
  feature: string | null;
  status: "ok" | "error" | null;
  retried: boolean;
  kind: "generate" | "embed" | null;
  page: number;
  pageSize: number;
};

function intInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

function oneOf<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): { ok: true; value: T | null } | { ok: false } {
  if (raw === undefined || raw === "") return { ok: true, value: null };
  return (allowed as readonly string[]).includes(raw)
    ? { ok: true, value: raw as T }
    : { ok: false };
}

export function parseCallsQuery(
  query: RawQuery,
  now: Date,
): { ok: true; query: CallsQuery } | { ok: false; reason: string } {
  const range = parseRange(query, now);
  if (!range.ok) return range;
  const service = parseServiceFilter(query.service);
  if (!service.ok) return service;

  const featureRaw = first(query.feature)?.trim() ?? "";
  if (featureRaw.length > MAX_FEATURE_LENGTH)
    return { ok: false, reason: "feature 가 올바르지 않습니다." };

  const status = oneOf(first(query.status), ["ok", "error"] as const);
  if (!status.ok) return { ok: false, reason: "status 가 올바르지 않습니다." };
  const kind = oneOf(first(query.kind), ["generate", "embed"] as const);
  if (!kind.ok) return { ok: false, reason: "kind 가 올바르지 않습니다." };

  const page = intInRange(first(query.page), 1, 1, Number.MAX_SAFE_INTEGER);
  if (page === null) return { ok: false, reason: "page 가 올바르지 않습니다." };
  const pageSize = intInRange(
    first(query.pageSize),
    DEFAULT_PAGE_SIZE,
    1,
    MAX_PAGE_SIZE,
  );
  if (pageSize === null)
    return { ok: false, reason: "pageSize 가 올바르지 않습니다." };

  return {
    ok: true,
    query: {
      from: range.from,
      to: range.to,
      service: service.service,
      feature: featureRaw || null,
      status: status.value,
      retried: first(query.retried) === "1",
      kind: kind.value,
      page,
      pageSize,
    },
  };
}
