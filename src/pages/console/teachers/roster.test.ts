import { describe, expect, test } from "vitest";
import { gradeLabel } from "../classLabel";
import { classText, gradeGroupLabel } from "./roster";

const school = (g: string | null) => gradeLabel(g, false);
const academy = (g: string | null) => gradeLabel(g, true);

describe("gradeGroupLabel", () => {
  test("school keeps N학년 and the group suffix", () => {
    expect(gradeGroupLabel("고1", null, school)).toBe("1학년");
    expect(gradeGroupLabel("고1", "A레벨", school)).toBe("1학년-A레벨");
  });

  test("academy shows the raw grade", () => {
    expect(gradeGroupLabel("고1", "A레벨", academy)).toBe("고1-A레벨");
  });

  test("a class without a grade is 다학년, with or without a group", () => {
    expect(gradeGroupLabel(null, null, academy)).toBe("다학년");
    expect(gradeGroupLabel(null, "A레벨", academy)).toBe("다학년-A레벨");
  });
});

describe("classText", () => {
  test("school keeps the existing shape", () => {
    expect(
      classText({ grade: "고2", groupName: null, name: "3" }, school),
    ).toBe("2학년 3반");
  });

  test("a mixed-grade class reads 다학년 N반", () => {
    expect(
      classText({ grade: null, groupName: null, name: "3" }, academy),
    ).toBe("다학년 3반");
  });
});
