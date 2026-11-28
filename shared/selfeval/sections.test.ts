import { describe, expect, it } from "vitest";
import { evidenceSchema, sentenceSchema } from "./sections.js";

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

describe("sentenceSchema", () => {
  const sentence = {
    id: "s1",
    text: "함수의 극한을 직접 계산해 보았다.",
    evidence: [evidence],
    feeling: false,
    confirmed: false,
  };

  it("근거를 담은 문장을 읽는다", () => {
    expect(sentenceSchema.parse(sentence)).toEqual(sentence);
  });

  it("근거가 없는 문장도 읽는다", () => {
    expect(
      sentenceSchema.parse({ ...sentence, evidence: [] }).evidence,
    ).toEqual([]);
  });

  it("근거가 모양에 맞지 않으면 거절한다", () => {
    expect(
      sentenceSchema.safeParse({ ...sentence, evidence: [{ sourceType: "P" }] })
        .success,
    ).toBe(false);
  });

  it("feeling 이나 confirmed 가 빠지면 거절한다", () => {
    const { feeling: _f, ...noFeeling } = sentence;
    const { confirmed: _c, ...noConfirmed } = sentence;
    expect(sentenceSchema.safeParse(noFeeling).success).toBe(false);
    expect(sentenceSchema.safeParse(noConfirmed).success).toBe(false);
  });
});
