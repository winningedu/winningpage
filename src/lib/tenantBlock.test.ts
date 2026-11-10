import { describe, expect, it } from "vitest";
import {
  parseTenantReason,
  TENANT_JOIN_LABEL,
  tenantBlockMessage,
} from "./tenantBlock";

describe("tenantBlockMessage", () => {
  it.each([
    ["teacher", "선생님 계정에서는 학생 서비스를 이용할 수 없어요."],
    ["catch_all", "소속코드를 입력하면 서비스를 이용할 수 있어요."],
    ["disabled", "소속 기관에서 제공하지 않는 서비스예요."],
    [
      "outside_period",
      "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
    ],
    [
      "grace",
      "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
    ],
    [
      "month_cap",
      "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
    ],
    ["term_cap", "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요."],
  ] as const)("%s 는 결정 99 문구", (reason, text) => {
    expect(tenantBlockMessage(reason)).toBe(text);
  });

  it("사유가 없으면 제공하지 않는 서비스 문구로 막는다", () => {
    expect(tenantBlockMessage(null)).toBe(
      "소속 기관에서 제공하지 않는 서비스예요.",
    );
  });

  it("소속코드 입력 버튼 이름은 고정이다", () => {
    expect(TENANT_JOIN_LABEL).toBe("소속코드 입력");
  });
});

describe("parseTenantReason", () => {
  it("알려진 사유만 돌려주고 나머지는 null", () => {
    expect(parseTenantReason("term_cap")).toBe("term_cap");
    expect(parseTenantReason("teacher")).toBe("teacher");
    expect(parseTenantReason("period_expired")).toBeNull();
    expect(parseTenantReason(undefined)).toBeNull();
    expect(parseTenantReason(3)).toBeNull();
  });
});
