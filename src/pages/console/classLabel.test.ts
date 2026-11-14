import { describe, expect, test } from "vitest";
import type { ConsoleClass } from "./api";
import {
  classLabel,
  gradeLabel,
  isAcademyOrg,
  sortClasses,
} from "./classLabel";

const cls = (over: Partial<ConsoleClass>): ConsoleClass => ({
  id: "c",
  grade: "고2",
  name: "3",
  group: null,
  isPrimary: false,
  ...over,
});

describe("gradeLabel", () => {
  test("학교는 N학년으로 보여 준다", () => {
    expect(gradeLabel("고2", false)).toBe("2학년");
    expect(gradeLabel("중1", false)).toBe("1학년");
  });

  test("학원은 중1, 고1 같은 원래 값을 그대로 보여 준다", () => {
    expect(gradeLabel("고2", true)).toBe("고2");
    expect(gradeLabel("중3", true)).toBe("중3");
  });

  test("필터 값 mixed 도 다학년이다", () => {
    expect(gradeLabel("mixed", true)).toBe("다학년");
  });

  test("학년이 없는 학급은 다학년이다", () => {
    expect(gradeLabel(null, true)).toBe("다학년");
    expect(gradeLabel(null, false)).toBe("다학년");
  });
});

describe("isAcademyOrg", () => {
  test("학교만 학교이고 나머지 기관 유형은 모두 학원 규칙이다", () => {
    expect(isAcademyOrg("학교")).toBe(false);
    for (const t of ["기관", "사기업", "캠퍼스", "기타"])
      expect(isAcademyOrg(t)).toBe(true);
  });
});

describe("classLabel", () => {
  const school = (g: string | null) => gradeLabel(g, false);
  const academy = (g: string | null) => gradeLabel(g, true);

  test("학교는 기존 모양을 유지한다", () => {
    expect(classLabel(cls({ group: "A그룹" }), school)).toBe("A그룹 2학년 3반");
  });

  test("학원은 원래 학년 값과 다학년을 쓴다", () => {
    expect(classLabel(cls({}), academy)).toBe("고2 3반");
    expect(classLabel(cls({ grade: null, group: "A" }), academy)).toBe(
      "A 다학년 3반",
    );
  });
});

describe("sortClasses", () => {
  test("다학년 학급은 학년이 있는 학급 뒤에 온다", () => {
    const sorted = sortClasses([
      cls({ id: "m", grade: null, name: "1" }),
      cls({ id: "b", grade: "고3", name: "1" }),
      cls({ id: "a", grade: "고1", name: "2" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["a", "b", "m"]);
  });
});
