// 핵심 오류 가드 테스트: 인과 부정 문장을 인과 단정으로 읽은 오판을 걸러낸다.
import { describe, expect, it } from "vitest";
import { dropDeniedCausalErrors, isCausalDenial } from "./coreErrorGuard.js";

describe("isCausalDenial", () => {
  it("실측 문장: 상관이지 인과를 보인 것은 아니다", () => {
    expect(
      isCausalDenial(
        "탁도가 높은 지점이 용존산소량도 낮았지만 이것은 상관이지 인과를 보인 것은 아니다.",
      ),
    ).toBe(true);
  });

  it("inquiry-full 샘플: 원인이라고 단정할 수 없다", () => {
    expect(
      isCausalDenial(
        "상관이 있다는 것까지만 말할 수 있고 노면 온도가 원인이라고 단정할 수 없다.",
      ),
    ).toBe(true);
  });

  it.each([
    ["1", "이 결과는 인과는 아니다."],
    ["1", "상관이지 인과관계가 아니라 단순한 동반 변화다."],
    ["2", "이것만으로 인과라고 할 수 없다."],
    ["2", "인과로 단정할 수 없다."],
    ["3", "이 결과가 인과관계를 보여주는 것은 아니다."],
    ["4", "이 상관은 인과를 뜻하지 않는다."],
    ["5", "인과로 단정하지 않았다."],
    ["6", "상관과 인과를 구분해야 한다."],
    ["7", "원인이라고 단정할 수 없다."],
  ])("표 패턴 %s: %s", (_n, text) => {
    expect(isCausalDenial(text)).toBe(true);
  });

  it("공백 변형과 어미 변형을 받는다", () => {
    expect(isCausalDenial("인과 는 아니다")).toBe(true);
    expect(isCausalDenial("인과라고 할 수는 없었다.")).toBe(true);
  });

  it("이중 부정은 단정으로 본다", () => {
    expect(isCausalDenial("인과가 아니라고 할 수 없다.")).toBe(false);
    expect(isCausalDenial("인과라고 할 수 없다고는 할 수 없다.")).toBe(false);
  });

  it.each([
    "상관일 뿐이다.",
    "노면 온도가 원인이 아니다.",
    "인과를 확인하지 못했다.",
    "인과가 약하다.",
    "탁도가 높아서 용존산소량이 낮아졌다.",
    "탁도가 용존산소량 감소의 원인이다.",
  ])("패턴 밖 문장은 false: %s", (text) => {
    expect(isCausalDenial(text)).toBe(false);
  });
});

describe("dropDeniedCausalErrors", () => {
  const denial = "상관이지 인과를 보인 것은 아니다.";
  const assertion = "탁도가 높아서 용존산소량이 낮아졌다.";

  it("인과 부정 인용을 가진 correlation_as_cause 만 뺀다", () => {
    const out = dropDeniedCausalErrors([
      { id: "correlation_as_cause" as const, quote: denial },
      { id: "overclaim" as const, quote: assertion },
    ]);
    expect(out.map((e) => e.id)).toEqual(["overclaim"]);
  });

  it("인과를 단정한 인용의 correlation_as_cause 는 남긴다", () => {
    const out = dropDeniedCausalErrors([
      { id: "correlation_as_cause" as const, quote: assertion },
    ]);
    expect(out).toHaveLength(1);
  });

  it("다른 id 는 인용이 부정 표현이어도 유지하고 순서를 지킨다", () => {
    const out = dropDeniedCausalErrors([
      { id: "overclaim" as const, quote: denial },
      { id: "variable_mismatch" as const, quote: denial },
      { id: "correlation_as_cause" as const, quote: assertion },
    ]);
    expect(out.map((e) => e.id)).toEqual([
      "overclaim",
      "variable_mismatch",
      "correlation_as_cause",
    ]);
  });
});
