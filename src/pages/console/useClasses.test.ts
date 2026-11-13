import { describe, expect, test } from "vitest";
import { MIXED_GRADE } from "./classLabel";
import {
  type ClassOption,
  classesOf,
  gradesOf,
  groupsOf,
  studentClassesOf,
  studentGradesOf,
  studentGroupsOf,
} from "./useClasses";

const cls = (
  id: string,
  grade: string | null,
  groupId: string | null = null,
): ClassOption => ({
  id,
  grade,
  groupId,
  groupName: groupId ? `이름${groupId}` : null,
  name: id,
  hasHomeroom: false,
});

describe("gradesOf", () => {
  test("lists only grades that have classes, in grade order, unchanged for graded classes", () => {
    expect(gradesOf([cls("a", "고2"), cls("b", "중1")])).toEqual([
      "중1",
      "고2",
    ]);
  });

  test("adds the mixed option last when a grade-less class exists", () => {
    expect(gradesOf([cls("a", "고2"), cls("m", null)])).toEqual([
      "고2",
      MIXED_GRADE,
    ]);
    expect(gradesOf([cls("m", null)])).toEqual([MIXED_GRADE]);
  });

  test("has no mixed option without grade-less classes", () => {
    expect(gradesOf([cls("a", "고2")])).not.toContain(MIXED_GRADE);
  });
});

describe("groupsOf and classesOf with the mixed filter", () => {
  const classes = [
    cls("a", "고1", "g1"),
    cls("m1", null, "g2"),
    cls("m2", null, null),
  ];

  test("mixed keeps only grade-less classes", () => {
    expect(classesOf(classes, MIXED_GRADE, "").map((c) => c.id)).toEqual([
      "m1",
      "m2",
    ]);
    expect(groupsOf(classes, MIXED_GRADE).map((g) => g.id)).toEqual(["g2"]);
  });

  test("a real grade does not include grade-less classes", () => {
    expect(classesOf(classes, "고1", "").map((c) => c.id)).toEqual(["a"]);
    expect(groupsOf(classes, "고1").map((g) => g.id)).toEqual(["g1"]);
  });

  test("no grade keeps every class", () => {
    expect(classesOf(classes, "", "").map((c) => c.id)).toEqual([
      "a",
      "m1",
      "m2",
    ]);
  });
});

describe("student pickers (a student's own grade, never the mixed filter value)", () => {
  const classes = [
    cls("a", "고1", "g1"),
    cls("b", "고2", "g1"),
    cls("m1", null, "g2"),
    cls("m2", null, null),
  ];

  test("grades are the classes' real grades when no mixed class exists", () => {
    expect(studentGradesOf([cls("a", "고2"), cls("b", "중1")])).toEqual([
      "중1",
      "고2",
    ]);
  });

  test("a mixed class accepts any grade, so every grade is offered and mixed itself never is", () => {
    expect(studentGradesOf(classes)).toEqual([
      "중1",
      "중2",
      "중3",
      "고1",
      "고2",
      "고3",
    ]);
    expect(studentGradesOf([cls("m", null)])).not.toContain(MIXED_GRADE);
  });

  test("classes fit a student of the same grade or a mixed class", () => {
    expect(studentClassesOf(classes, "고1", "").map((c) => c.id)).toEqual([
      "a",
      "m1",
      "m2",
    ]);
    expect(studentClassesOf(classes, "고3", "").map((c) => c.id)).toEqual([
      "m1",
      "m2",
    ]);
    expect(studentClassesOf(classes, "고1", "g2").map((c) => c.id)).toEqual([
      "m1",
    ]);
  });

  test("groups are those of the same grade's or mixed classes", () => {
    expect(studentGroupsOf(classes, "고1").map((g) => g.id)).toEqual([
      "g1",
      "g2",
    ]);
    expect(studentGroupsOf(classes, "고3").map((g) => g.id)).toEqual(["g2"]);
  });
});
