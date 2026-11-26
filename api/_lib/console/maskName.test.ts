// 콘솔 이름 가림 규칙 검증(결정 8, 27, 41: Figma 프레임 기준). 성 다음 한 글자만 가린다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  consoleMaskName,
  displayNameFor,
  displayNamesFor,
  maskName,
  nameMatchesQuery,
} from "./maskName.js";

// 가림 여부는 사이트가 정한다. 기존 가림 검증은 스쿨멘토로 고정하고, 위닝은 따로 본다.
beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("위닝 사이트는 실명을 보여 준다", () => {
  beforeEach(() => {
    vi.stubEnv("SITE", "winning");
  });

  test("consoleMaskName 은 위닝에서 실명, 스쿨멘토에서 가린 이름", () => {
    expect(consoleMaskName("김하늘")).toBe("김하늘");
    vi.stubEnv("SITE", "schoolmentor");
    expect(consoleMaskName("김하늘")).toBe("김*늘");
  });

  test("displayNameFor 는 모든 행위자에게 실명을 준다", () => {
    for (const kind of [
      "homeroom",
      "school_admin",
      "hq_proxy",
      "hq",
    ] as const) {
      expect(displayNameFor({ kind }, "김하늘")).toBe("김하늘");
    }
  });

  test("담임은 SITE 가 없어도 실명이다", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SITE", "");
    expect(displayNameFor({ kind: "homeroom" }, "김하늘")).toBe("김하늘");
  });

  test("nameMatchesQuery 는 모든 행위자에게 부분 일치다", () => {
    expect(nameMatchesQuery({ kind: "school_admin" }, "김하늘", "하")).toBe(
      true,
    );
    expect(nameMatchesQuery({ kind: "hq" }, "김하늘", "김하")).toBe(true);
  });

  test("displayNamesFor 는 별표 없이 실명을 준다", () => {
    const names = displayNamesFor({ kind: "school_admin" }, [
      { id: "x", group: "c1", name: "김하늘" },
      { id: "y", group: "c1", name: "김하늘" },
    ]);
    expect(names.get("x")).toBe("김하늘");
    expect(names.get("y")).toBe("김하늘");
  });
});

describe("스쿨멘토 사이트의 이름 검색", () => {
  test("담임은 부분 일치, 그 밖은 전체 일치다", () => {
    expect(nameMatchesQuery({ kind: "homeroom" }, "김하늘", "하")).toBe(true);
    expect(nameMatchesQuery({ kind: "school_admin" }, "김하늘", "하")).toBe(
      false,
    );
    expect(nameMatchesQuery({ kind: "school_admin" }, "김하늘", "김하늘")).toBe(
      true,
    );
  });
});
