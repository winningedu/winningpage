// 콘솔 이름 가림 규칙 검증(결정 8, 27, 41: Figma 프레임 기준). 성 다음 한 글자만 가린다.

import { describe, expect, test } from "vitest";
import { maskName } from "./maskName.js";

describe("maskName", () => {
  test.each([
    ["김하늘", "김*늘"],
    ["윤하린", "윤*린"],
    ["강호", "강*"],
    ["마리아 호세 페르난데스 주니어", "마*아 호세 페르난데스 주니어"],
  ])("%s becomes %s", (name, masked) => {
    expect(maskName(name)).toBe(masked);
  });

  test("a single character name and an empty name stay as they are", () => {
    expect(maskName("김")).toBe("김");
    expect(maskName("")).toBe("");
  });

  test("surrogate pair characters count as one character", () => {
    expect(maskName("김𠮷늘")).toBe("김*늘");
  });
});
