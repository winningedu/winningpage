// 스쿨멘토 서비스 막힘 문구의 단일 정본(결정 99). 서버가 주는 tenantReason 을 문구로 바꾼다.
// 위닝 화면은 문구를 바로 쓰지 않고 사이트 기능 스위치 tenantServiceGate 로 먼저 가른다.

import { site } from "@/config/site";

export type TenantBlockReason =
  | "teacher"
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
  teacher: "선생님 계정에서는 학생 서비스를 이용할 수 없어요.",
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

/** 목표관리 화면의 이용 거부 문구. 스쿨멘토는 결정 99 문구, 위닝은 화면이 쓰던 문구(winningText)를 그대로 쓴다. */
export function goalNotAllowedMessage(
  reason: TenantBlockReason | null,
  winningText: string,
): string {
  return site.features.tenantServiceGate
    ? tenantBlockMessage(reason)
    : winningText;
}

/**
 * 수행평가 채팅처럼 서버 문구를 그대로 띄우는 곳의 이용권 거부 문구. 서버의 NO_ENTITLEMENT 문구는 결제를
 * 안내하므로(위닝 기준) 스쿨멘토에서는 결정 99 문구로 바꾼다. 위닝과 다른 오류 코드는 서버 문구 그대로다.
 */
export function entitlementDeniedMessage(
  code: string,
  serverMessage: string,
  tenantReason: unknown,
): string {
  const denied = code === "NO_ENTITLEMENT" || code === "ENTITLEMENT_EXPIRED";
  return denied && site.features.tenantServiceGate
    ? tenantBlockMessage(parseTenantReason(tenantReason))
    : serverMessage;
}
