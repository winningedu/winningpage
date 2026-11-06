import { beforeEach, describe, expect, it, vi } from "vitest";
import { goalNotAllowedMessage } from "./tenantBlock";

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
