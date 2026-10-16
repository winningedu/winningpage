// 관리자 성장설계 이용권 부여(POST /api/admin/growth-grant)의 순수 규칙.
//
// program_access_grants 제약(baseline + 20260901001438)에서 나온 규칙:
//   - granted_by 'admin' 이면 granted_by_actor 필수(pag_admin_actor_check).
//   - granted_months 와 granted_sessions 가 둘 다 null 일 수 없다(pag_entitlement_shape_check).
//     그래서 회차(sessionQuota)는 필수로 받는다.
//   - (granted_months, validity_days 가 둘 다 null) 과 (expires_at 이 null) 은 같아야 한다.
//     기간을 안 주면 셋 다 null(회차만 한정, 기간 무기한), months 를 주면 granted_months 와
//     expires_at, endsAt 을 주면 validity_days 와 expires_at 을 채운다.
//   - 기간 기본값을 코드로 정하지 않는다. 요청에 없으면 기간 무기한이다.

export const GROWTH_PROGRAM_KEY = "growth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

export type GrantBody = {
  profileId: string;
  sessionQuota: number;
  months: number | null;
  endsAt: string | null;
};

export function validateGrantBody(
  raw: unknown,
): { ok: true; body: GrantBody } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, reason: "요청 본문이 올바르지 않습니다." };
  const b = raw as Record<string, unknown>;

  if (typeof b.profileId !== "string" || !UUID_RE.test(b.profileId.trim()))
    return { ok: false, reason: "profileId 가 올바르지 않습니다." };

  if (
    typeof b.sessionQuota !== "number" ||
    !Number.isInteger(b.sessionQuota) ||
    b.sessionQuota < 1
  )
    return { ok: false, reason: "sessionQuota 는 1 이상의 정수여야 합니다." };

  let months: number | null = null;
  if (b.months !== undefined && b.months !== null) {
    if (
      typeof b.months !== "number" ||
      !Number.isInteger(b.months) ||
      b.months < 1
    )
      return { ok: false, reason: "months 는 1 이상의 정수여야 합니다." };
    months = b.months;
  }

  let endsAt: string | null = null;
  if (b.endsAt !== undefined && b.endsAt !== null) {
    const t = typeof b.endsAt === "string" ? Date.parse(b.endsAt) : Number.NaN;
    if (Number.isNaN(t))
      return { ok: false, reason: "endsAt 이 올바른 시각이 아닙니다." };
    endsAt = new Date(t).toISOString();
  }

  if (months !== null && endsAt !== null)
    return { ok: false, reason: "months 와 endsAt 은 함께 줄 수 없습니다." };

  return {
    ok: true,
    body: {
      profileId: b.profileId.trim(),
      sessionQuota: b.sessionQuota,
      months,
      endsAt,
    },
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

export type GrantRow = {
  profile_id: string;
  program_key: string;
  granted_by: "admin";
  granted_by_actor: string;
  granted_sessions: number;
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
  let expiresAt: string | null = null;
  let validityDays: number | null = null;

  if (body.months !== null) {
    expiresAt = addMonthsUtc(nowIso, body.months);
  } else if (body.endsAt !== null) {
    const span = Date.parse(body.endsAt) - Date.parse(nowIso);
    if (span <= 0) throw new Error("endsAt 이 시작 시각보다 늦어야 합니다.");
    expiresAt = body.endsAt;
    validityDays = Math.ceil(span / DAY_MS);
  }

  return {
    profile_id: body.profileId,
    program_key: GROWTH_PROGRAM_KEY,
    granted_by: "admin",
    granted_by_actor: actorId,
    granted_sessions: body.sessionQuota,
    granted_months: body.months,
    validity_days: validityDays,
    paid_amount: 0,
    starts_at: nowIso,
    expires_at: expiresAt,
    memo: "관리자 수동 부여(성장설계 운영 도구)",
  };
}
