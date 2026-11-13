import { describe, expect, test } from "vitest";
import { MIXED_GRADE } from "./classLabel";
import { type ClassOption, classesOf, gradesOf, groupsOf } from "./useClasses";

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
