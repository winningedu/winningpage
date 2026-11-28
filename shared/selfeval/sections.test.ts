import { describe, expect, it } from "vitest";
import { evidenceSchema } from "./sections.js";

const evidence = {
  sourceType: "P",
  refId: "rec-1",
  item: "result",
  weight: "main",
};

describe("evidenceSchema", () => {
  it("활동 기록 근거를 읽는다", () => {
    expect(evidenceSchema.parse(evidence)).toEqual(evidence);
  });

  it("학생 입력 근거는 refId 가 null 이다", () => {
    const student = {
      sourceType: "S",
      refId: null,
      item: "student_input",
      weight: "sub",
    };
    expect(evidenceSchema.parse(student)).toEqual(student);
  });

  it("모르는 출처 유형, 항목, 가중치는 거절한다", () => {
    expect(
      evidenceSchema.safeParse({ ...evidence, sourceType: "X" }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...evidence, item: "next2" }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...evidence, weight: "big" }).success,
    ).toBe(false);
  });

  it("refId 가 빠지면 거절한다", () => {
    const { refId: _refId, ...rest } = evidence;
    expect(evidenceSchema.safeParse(rest).success).toBe(false);
  });
});
