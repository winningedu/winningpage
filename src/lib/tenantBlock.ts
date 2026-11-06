// 스쿨멘토 서비스 막힘 문구의 단일 정본(결정 99). 서버가 주는 tenantReason 을 문구로 바꾼다.
// 위닝 화면은 이 모듈을 쓰지 않는다(사이트 기능 스위치 tenantServiceGate 로 먼저 가른다).

export type TenantBlockReason =
  | "catch_all"
  | "disabled"
  | "outside_period"
  | "grace"
  | "month_cap"
  | "term_cap";

export const TENANT_JOIN_LABEL = "소속코드 입력";

const PERIOD_MESSAGE =
  "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.";

const MESSAGES: Record<TenantBlockReason, string> = {
  catch_all: "소속코드를 입력하면 서비스를 이용할 수 있어요.",
  disabled: "소속 기관에서 제공하지 않는 서비스예요.",
  outside_period: PERIOD_MESSAGE,
  grace: PERIOD_MESSAGE,
  month_cap:
    "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
  term_cap: "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
};

export function parseTenantReason(value: unknown): TenantBlockReason | null {
  return typeof value === "string" && value in MESSAGES
    ? (value as TenantBlockReason)
    : null;
}

/** 사유가 없으면(기관 없음, 서버가 사유를 못 줌) 제공하지 않는 서비스로 본다(결정 98-8). */
export function tenantBlockMessage(reason: TenantBlockReason | null): string {
  return MESSAGES[reason ?? "disabled"];
}
