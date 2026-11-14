import { describe, expect, it } from "vitest";
import { HOMEPAGE_PREFIX, withoutBareScheme } from "./homepage";

describe("withoutBareScheme", () => {
  it("스킴만 남은 값은 빈 문자열로 본다", () => {
    expect(HOMEPAGE_PREFIX).toBe("http://");
    expect(withoutBareScheme("http://")).toBe("");
    expect(withoutBareScheme("  https://  ")).toBe("");
  });

  it("스킴 뒤에 글자가 있거나 다른 값이면 그대로 둔다", () => {
    expect(withoutBareScheme("http://a.kr")).toBe("http://a.kr");
    expect(withoutBareScheme("hanbit.kr")).toBe("hanbit.kr");
    expect(withoutBareScheme("")).toBe("");
  });
});
