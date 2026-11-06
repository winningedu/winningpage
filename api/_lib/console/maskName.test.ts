// 콘솔 이름 가림 규칙 검증(결정 8, 27, 41: Figma 프레임 기준). 성 다음 한 글자만 가린다.

import { describe, expect, test } from "vitest";
import { displayNameFor, displayNamesFor, maskName } from "./maskName.js";

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

describe("displayNameFor", () => {
  test("a homeroom sees the real name and every other actor sees it masked", () => {
    expect(displayNameFor({ kind: "homeroom" }, "김하늘")).toBe("김하늘");
    for (const kind of ["school_admin", "hq_proxy", "hq"] as const) {
      expect(displayNameFor({ kind }, "김하늘")).toBe("김*늘");
    }
  });
});

describe("displayNamesFor", () => {
  const students = [
    { id: "a", group: "c1", name: "김하늘" },
    { id: "b", group: "c1", name: "김하은" },
    { id: "c", group: "c2", name: "김하은" },
    { id: "d", group: "c1", name: "박서준" },
  ];

  test("the same student listed twice is not a clash", () => {
    const names = displayNamesFor({ kind: "school_admin" }, [
      { id: "a", group: "c1", name: "김하늘" },
      { id: "a", group: "c1", name: "김하늘" },
    ]);
    expect(names.get("a")).toBe("김*늘");
  });

  test("a homeroom sees real names unchanged", () => {
    const names = displayNamesFor({ kind: "homeroom" }, students);
    expect(names.get("b")).toBe("김하은");
  });

  test("others get masked names, and students in the same group that mask the same get a trailing star", () => {
    const names = displayNamesFor({ kind: "school_admin" }, students);

    expect(names.get("a")).toBe("김*늘");
    expect(names.get("b")).toBe("김*은");
    expect(names.get("c")).toBe("김*은");
    expect(names.get("d")).toBe("박*준");
    const clash = displayNamesFor({ kind: "school_admin" }, [
      { id: "x", group: "c1", name: "김하늘" },
      { id: "y", group: "c1", name: "김하늘" },
    ]);
    expect(clash.get("x")).toBe("김*늘*");
    expect(clash.get("y")).toBe("김*늘*");
  });
});
