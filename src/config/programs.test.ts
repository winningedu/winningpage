import { describe, expect, it } from "vitest";
import {
  isHiddenProgramLink,
  parseHiddenPrograms,
  programOfLink,
} from "./programs";

describe("parseHiddenPrograms", () => {
  it("쉼표로 구분한 program key를 배열로 만든다", () => {
    expect(parseHiddenPrograms("growth,selfeval,inquiry")).toEqual([
      "growth",
      "selfeval",
      "inquiry",
    ]);
  });

  it("공백을 제거하고 대소문자를 무시한다", () => {
    expect(parseHiddenPrograms(" growth , SelfEval ")).toEqual([
      "growth",
      "selfeval",
    ]);
  });

  it("빈 값이나 undefined는 빈 배열이다", () => {
    expect(parseHiddenPrograms("")).toEqual([]);
    expect(parseHiddenPrograms("  ,, ")).toEqual([]);
    expect(parseHiddenPrograms(undefined)).toEqual([]);
  });

  it("모르는 키는 무시하고 중복은 하나로 합친다", () => {
    expect(parseHiddenPrograms("growth,unknown,growth,goal")).toEqual([
      "growth",
    ]);
  });
});

describe("programOfLink", () => {
  it("소개 페이지와 앱 경로를 program key로 해석한다", () => {
    expect(programOfLink("/services/growth")).toBe("growth");
    expect(programOfLink("/app/growth/survey")).toBe("growth");
    expect(programOfLink("/services/self-assessment")).toBe("selfeval");
    expect(programOfLink("/app/selfeval")).toBe("selfeval");
    expect(programOfLink("/services/research?x=1#a")).toBe("inquiry");
    expect(programOfLink("/app/inquiry/reports/1")).toBe("inquiry");
  });

  it("관련 없는 경로와 접두사만 같은 경로는 null이다", () => {
    expect(programOfLink("/services/goal")).toBeNull();
    expect(programOfLink("/services/growthx")).toBeNull();
    expect(programOfLink(undefined)).toBeNull();
  });
});

describe("isHiddenProgramLink", () => {
  it("숨김 목록에 든 프로그램의 경로만 true다", () => {
    expect(isHiddenProgramLink("/services/growth", ["growth"])).toBe(true);
    expect(isHiddenProgramLink("/services/research", ["growth"])).toBe(false);
    expect(isHiddenProgramLink("/services/growth", [])).toBe(false);
  });
});
