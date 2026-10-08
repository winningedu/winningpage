// contentLength.ts(지식 DB 작성 안내)의 순수 함수 테스트.
import { describe, expect, it } from "vitest";

import { contentLengthHelp } from "./contentLength";

describe("contentLengthHelp", () => {
  it("현재 글자 수와 권장 분량을 함께 보여 준다", () => {
    expect(contentLengthHelp("가나다")).toBe("현재 3자, 권장 500자 안팎");
    expect(contentLengthHelp("가".repeat(1234))).toBe(
      "현재 1,234자, 권장 500자 안팎",
    );
  });

  it("값이 없으면 0자로 센다", () => {
    expect(contentLengthHelp(undefined)).toBe("현재 0자, 권장 500자 안팎");
  });
});
