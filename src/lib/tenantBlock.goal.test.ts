import { beforeEach, describe, expect, it, vi } from "vitest";
import { entitlementDeniedMessage, goalNotAllowedMessage } from "./tenantBlock";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

beforeEach(() => {
  siteState.tenantServiceGate = false;
});

describe("goalNotAllowedMessage", () => {
  it("위닝은 화면이 넘긴 기존 문구를 그대로 쓴다", () => {
    expect(goalNotAllowedMessage("month_cap", "이용권이 필요합니다.")).toBe(
      "이용권이 필요합니다.",
    );
  });

  it("스쿨멘토는 사유에 맞는 결정 99 문구를 쓴다", () => {
    siteState.tenantServiceGate = true;
    expect(goalNotAllowedMessage("month_cap", "이용권이 필요합니다.")).toBe(
      "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
    );
  });

  it("스쿨멘토에서 사유가 없으면 제공하지 않는 서비스 문구를 쓴다", () => {
    siteState.tenantServiceGate = true;
    expect(goalNotAllowedMessage(null, "이용권이 필요합니다.")).toBe(
      "소속 기관에서 제공하지 않는 서비스예요.",
    );
  });
});

describe("entitlementDeniedMessage", () => {
  const SERVER = "유료 이용권을 결제하신 뒤 이용할 수 있습니다.";

  it("위닝은 서버 문구를 그대로 쓴다", () => {
    expect(
      entitlementDeniedMessage("NO_ENTITLEMENT", SERVER, "month_cap"),
    ).toBe(SERVER);
  });

  it("스쿨멘토의 이용권 거부는 사유에 맞는 결정 99 문구를 쓴다", () => {
    siteState.tenantServiceGate = true;
    expect(entitlementDeniedMessage("NO_ENTITLEMENT", SERVER, "grace")).toBe(
      "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
    );
    expect(
      entitlementDeniedMessage("ENTITLEMENT_EXPIRED", "x", "outside_period"),
    ).toBe(
      "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
    );
  });

  it("스쿨멘토에서 사유가 없으면 제공하지 않는 서비스 문구를 쓴다", () => {
    siteState.tenantServiceGate = true;
    expect(entitlementDeniedMessage("NO_ENTITLEMENT", SERVER, undefined)).toBe(
      "소속 기관에서 제공하지 않는 서비스예요.",
    );
  });

  it("이용권 거부가 아닌 오류는 서버 문구를 그대로 쓴다", () => {
    siteState.tenantServiceGate = true;
    expect(entitlementDeniedMessage("NOT_SESSION_OWNER", "없어요", null)).toBe(
      "없어요",
    );
  });
});
