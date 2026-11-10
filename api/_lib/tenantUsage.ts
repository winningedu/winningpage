// 스쿨멘토 기관(tenant) 이용 판정 공용 모듈. 위닝은 이 모듈을 부르지 않는다
// (호출부가 isSchoolmentorSite() 로 먼저 가른다). 정본은 DB 함수다:
//   fn_tenant_usage_state     학생의 한 서비스 상태(기간, 유예, 월/학기 한도)
//   fn_consume_tenant_usage   (source_kind, source_id) 당 1회만 세는 소비(멱등)
//
// 거부 사유(tenantReason, deny_reason) 값:
//   teacher         선생님 계정(학생 서비스를 쓸 수 없다)
//   catch_all       기타 소속(소속코드를 입력해야 한다)
//   disabled        기관 설정 없음 또는 꺼짐, 소속 기관 없음
//   outside_period  이용 기간 전 또는 유예까지 끝남
//   grace           계약 종료 뒤 유예 기간
//   month_cap       이번 달 한도 소진
//   term_cap        이번 학기 한도 소진
// 진입 게이트는 teacher, catch_all, disabled, outside_period, grace 만 막고 month_cap, term_cap 은
// 막지 않는다(이미 센 작업은 열려 있다). 시작 지점과 소비는 한도까지 집행한다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type TenantDenyReason =
  | "teacher"
  | "catch_all"
  | "disabled"
  | "outside_period"
  | "grace"
  | "month_cap"
  | "term_cap";

export type TenantUsageState = {
  allowed: boolean;
  denyReason: TenantDenyReason | null;
  monthLimit: number | null;
  monthRemaining: number | null;
  termLimit: number | null;
  termRemaining: number | null;
  monthResetsOn: string | null;
  termResetsOn: string | null;
};

export type TenantUsageSource = {
  kind:
    | "performance_session"
    | "diagnosis_attempt"
    | "growth_report"
    | "selfeval_session"
    | "inquiry_session";
  id: string;
};

/** service_key -> tenant_service_settings.program_key. 목표관리만 target 이다. */
export const PROGRAM_KEY_BY_SERVICE: Record<string, string> = {
  suhaeng: "suhaeng",
  goal: "target",
  diagnose: "diagnose",
  growth: "growth",
  selfeval: "selfeval",
  inquiry: "inquiry",
};

const DENY_REASONS: ReadonlySet<string> = new Set([
  "teacher",
  "catch_all",
  "disabled",
  "outside_period",
  "grace",
  "month_cap",
  "term_cap",
]);

/** 임의 사유 문자열에서 기관 거부 사유만 남긴다. 위닝의 period_expired 같은 값은 null 이다. */
export function tenantReasonOf(
  reason: string | null | undefined,
): TenantDenyReason | null {
  return reason && DENY_REASONS.has(reason)
    ? (reason as TenantDenyReason)
    : null;
}

/** 오류 응답 extra 에 펼치는 조각. 사유가 없으면 빈 객체라 위닝 응답은 바뀌지 않는다. */
export function tenantReasonExtra(reason: unknown): {
  tenantReason?: TenantDenyReason;
} {
  const known = tenantReasonOf(typeof reason === "string" ? reason : null);
  return known ? { tenantReason: known } : {};
}

const CAP_REASONS: ReadonlySet<string> = new Set(["month_cap", "term_cap"]);

export async function readTenantUsage(
  db: SupabaseClient,
  userId: string,
  programKey: string,
): Promise<TenantUsageState> {
  const { data, error } = await db.rpc("fn_tenant_usage_state", {
    p_profile: userId,
    p_program_key: programKey,
  });
  if (error) throw new Error(`fn_tenant_usage_state 실패: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!r) throw new Error("fn_tenant_usage_state 가 행을 돌려주지 않았어요.");
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    allowed: r.allowed === true,
    denyReason: str(r.deny_reason) as TenantDenyReason | null,
    monthLimit: num(r.month_limit),
    monthRemaining: num(r.month_remaining),
    termLimit: num(r.term_limit),
    termRemaining: num(r.term_remaining),
    monthResetsOn: str(r.month_resets_on),
    termResetsOn: str(r.term_resets_on),
  };
}

/** 진입 게이트. 한도(month_cap, term_cap)는 보지 않는다. */
export function tenantEntryAccess(state: TenantUsageState): {
  allowed: boolean;
  reason: TenantDenyReason | null;
} {
  if (state.denyReason === null || CAP_REASONS.has(state.denyReason)) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: state.denyReason };
}

/**
 * 새 작업을 만들기 전 확인. 막으면 사유, 통과면 null.
 * 한도에 걸려도 같은 source 가 이미 센 작업이면 이어서 하게 둔다.
 */
export async function checkTenantStart(
  db: SupabaseClient,
  userId: string,
  programKey: string,
  source: TenantUsageSource,
): Promise<TenantDenyReason | null> {
  const state = await readTenantUsage(db, userId, programKey);
  if (state.denyReason === null) return null;
  if (CAP_REASONS.has(state.denyReason)) {
    const { data } = await db
      .from("tenant_usage_events")
      .select("id")
      .eq("profile_id", userId)
      .eq("program_key", programKey)
      .eq("source_kind", source.kind)
      .eq("source_id", source.id)
      .limit(1)
      .maybeSingle();
    if (data) return null;
  }
  return state.denyReason;
}

export type TenantConsumeResult = {
  status:
    | "charged"
    | "already_charged"
    | "quota_exhausted"
    | "no_entitlement"
    | "entitlement_expired";
  charged: boolean;
  tenantReason: TenantDenyReason | null;
};

const CONSUME_MAP: Record<string, TenantConsumeResult> = {
  consumed: { status: "charged", charged: true, tenantReason: null },
  already_consumed: {
    status: "already_charged",
    charged: true,
    tenantReason: null,
  },
  month_cap: {
    status: "quota_exhausted",
    charged: false,
    tenantReason: "month_cap",
  },
  term_cap: {
    status: "quota_exhausted",
    charged: false,
    tenantReason: "term_cap",
  },
  teacher: {
    status: "no_entitlement",
    charged: false,
    tenantReason: "teacher",
  },
  catch_all: {
    status: "no_entitlement",
    charged: false,
    tenantReason: "catch_all",
  },
  disabled: {
    status: "no_entitlement",
    charged: false,
    tenantReason: "disabled",
  },
  outside_period: {
    status: "entitlement_expired",
    charged: false,
    tenantReason: "outside_period",
  },
  grace: {
    status: "entitlement_expired",
    charged: false,
    tenantReason: "grace",
  },
};

/** fn_consume_tenant_usage 결과를 위닝 어휘(status, charged)로 옮기고 원래 사유는 tenantReason 에 둔다. */
export function mapTenantConsumeResult(result: unknown): TenantConsumeResult {
  const mapped = typeof result === "string" ? CONSUME_MAP[result] : undefined;
  if (!mapped) throw new Error(`알 수 없는 기관 소비 결과: ${String(result)}`);
  return { ...mapped };
}

export async function consumeTenantUsage(
  db: SupabaseClient,
  userId: string,
  programKey: string,
  source: TenantUsageSource,
): Promise<TenantConsumeResult> {
  const { data, error } = await db.rpc("fn_consume_tenant_usage", {
    p_profile: userId,
    p_program_key: programKey,
    p_source_kind: source.kind,
    p_source_id: source.id,
  });
  if (error) throw new Error(`fn_consume_tenant_usage 실패: ${error.message}`);
  return mapTenantConsumeResult(data);
}

export type TenantQuota = {
  quotaTotal: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
  limitKind: "month" | "term" | null;
  /** 남은 횟수가 0 일 때만 month_cap 또는 term_cap, 아니면 null. */
  capReason: "month_cap" | "term_cap" | null;
};

/** 안내용 남은 횟수. 월과 학기 중 남은 횟수가 작은 쪽(같으면 학기), 한도가 없으면 전부 null(무제한). */
export function readTenantQuota(state: TenantUsageState): TenantQuota {
  const month =
    state.monthRemaining === null
      ? null
      : {
          kind: "month" as const,
          remaining: state.monthRemaining,
          limit: state.monthLimit,
          resetsOn: state.monthResetsOn,
        };
  const term =
    state.termRemaining === null
      ? null
      : {
          kind: "term" as const,
          remaining: state.termRemaining,
          limit: state.termLimit,
          resetsOn: state.termResetsOn,
        };
  const binding =
    month && term
      ? term.remaining <= month.remaining
        ? term
        : month
      : (month ?? term);
  if (!binding) {
    return {
      quotaTotal: null,
      quotaUsed: null,
      quotaRemaining: null,
      planEndsAt: null,
      planLabel: null,
      limitKind: null,
      capReason: null,
    };
  }
  return {
    quotaTotal: binding.limit,
    quotaUsed:
      binding.limit === null ? null : binding.limit - binding.remaining,
    quotaRemaining: binding.remaining,
    planEndsAt: binding.resetsOn,
    planLabel: null,
    limitKind: binding.kind,
    capReason:
      binding.remaining === 0
        ? binding.kind === "month"
          ? "month_cap"
          : "term_cap"
        : null,
  };
}
