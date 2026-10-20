import { describe, expect, it } from "vitest";
import { coverTitleFontSize } from "./coverTitleSize";

describe("coverTitleFontSize", () => {
  it("짧은 두 줄 제목은 기본 크기 7cqw 를 쓴다", () => {
    expect(coverTitleFontSize("위닝에듀\n최종 제출본")).toBe(7);
  });
});
