// 관리자 심화탐구 이용권 부여(POST /api/admin/inquiry-grant)의 순수 규칙.
//
// program_access_grants 제약에서 나온 규칙(성장설계 ops/grant.ts 와 같은 근거):
//   - granted_by 'admin' 이면 granted_by_actor 필수(pag_admin_actor_check).
//   - granted_months 와 granted_sessions 가 둘 다 null 일 수 없다(pag_entitlement_shape_check).
//   - (granted_months, validity_days 가 둘 다 null) 과 (expires_at 이 null) 은 같아야 한다.
//
// 성장설계와 다른 점: 입력이 개월 수가 아니라 시작일과 만료일이고, 세션 수에 무제한(null)이 있다.
//   - 세션 수가 있고 만료일이 없으면 세션 수만 한정, 기간 무기한이다.
//   - 세션 수가 있고 만료일이 있으면 validity_days(올림 일수)와 expires_at 을 채운다.
//   - 무제한이면 granted_sessions 가 null 이라 shape 제약상 granted_months 가 필요하다.
//     그래서 만료일이 필수이고, granted_months 는 시작일에서 만료일까지를 덮는 최소 개월 수다.
//     실제 만료 판정은 expires_at 이 한다.
//   - 기간 기본값을 코드로 정하지 않는다. 요청에 없으면 기간 무기한이다.

export const INQUIRY_PROGRAM_KEY = "inquiry";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

export type GrantBody = {
  profileId: string;
  /** null 이면 무제한. */
  sessionQuota: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

function parseIso(v: unknown): string | null | "invalid" {
  if (v === undefined || v === null) return null;
  const t = typeof v === "string" ? Date.parse(v) : Number.NaN;
  return Number.isNaN(t) ? "invalid" : new Date(t).toISOString();
}

export function validateGrantBody(
  raw: unknown,
): { ok: true; body: GrantBody } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, reason: "요청 본문이 올바르지 않습니다." };
  const b = raw as Record<string, unknown>;

  if (typeof b.profileId !== "string" || !UUID_RE.test(b.profileId.trim()))
    return { ok: false, reason: "profileId 가 올바르지 않습니다." };

  let sessionQuota: number | null;
  if (b.sessionQuota === null) {
    sessionQuota = null;
  } else if (
    typeof b.sessionQuota === "number" &&
    Number.isInteger(b.sessionQuota) &&
    b.sessionQuota >= 1
  ) {
    sessionQuota = b.sessionQuota;
  } else {
    return {
      ok: false,
      reason: "sessionQuota 는 1 이상의 정수 또는 null(무제한)이어야 합니다.",
    };
  }

  const startsAt = parseIso(b.startsAt);
  if (startsAt === "invalid")
    return { ok: false, reason: "startsAt 이 올바른 시각이 아닙니다." };
  const endsAt = parseIso(b.endsAt);
  if (endsAt === "invalid")
    return { ok: false, reason: "endsAt 이 올바른 시각이 아닙니다." };

  if (sessionQuota === null && endsAt === null)
    return { ok: false, reason: "무제한 부여는 만료일이 필요합니다." };
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt)
    return { ok: false, reason: "endsAt 은 startsAt 보다 늦어야 합니다." };

  return {
    ok: true,
    body: { profileId: b.profileId.trim(), sessionQuota, startsAt, endsAt },
  };
}

/** 같은 날짜 n개월 뒤. 대상 달에 그 날이 없으면 말일로 맞춘다. */
function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** start 에서 end 를 덮는 최소 개월 수. */
function coveringMonths(startIso: string, endIso: string): number {
  let m = 1;
  while (addMonthsUtc(startIso, m) < endIso) m += 1;
  return m;
}

export type GrantRow = {
  profile_id: string;
  program_key: string;
  granted_by: "admin";
  granted_by_actor: string;
  granted_sessions: number | null;
  granted_months: number | null;
  validity_days: number | null;
  paid_amount: number;
  starts_at: string;
  expires_at: string | null;
  memo: string;
};

export function buildGrantRow(
  body: GrantBody,
  actorId: string,
  nowIso: string,
): GrantRow {
  const startsAt = body.startsAt ?? nowIso;
  let expiresAt: string | null = null;
  let validityDays: number | null = null;
  let grantedMonths: number | null = null;

  if (body.endsAt !== null) {
    const span = Date.parse(body.endsAt) - Date.parse(startsAt);
    if (span <= 0) throw new Error("endsAt 이 시작 시각보다 늦어야 합니다.");
    expiresAt = body.endsAt;
    if (body.sessionQuota === null)
      grantedMonths = coveringMonths(startsAt, body.endsAt);
    else validityDays = Math.ceil(span / DAY_MS);
  } else if (body.sessionQuota === null) {
    throw new Error("무제한 부여는 endsAt 이 필요합니다.");
  }

  return {
    profile_id: body.profileId,
    program_key: INQUIRY_PROGRAM_KEY,
    granted_by: "admin",
    granted_by_actor: actorId,
    granted_sessions: body.sessionQuota,
    granted_months: grantedMonths,
    validity_days: validityDays,
    paid_amount: 0,
    starts_at: startsAt,
    expires_at: expiresAt,
    memo: "관리자 수동 부여(심화탐구 운영 도구)",
  };
}
