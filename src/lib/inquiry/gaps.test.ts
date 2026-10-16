import { describe, expect, test } from "vitest";
import * as server from "../../../api/_lib/inquiry/gaps";
import { gapCandidates, validateInterview } from "./gaps";
import type { InterviewAnswers } from "./types";

const CASES: InterviewAnswers[] = [
  { q1: "수질 조사" },
  { q1: "a", q4: "교과서 지표" },
  { q1: "a", q4: "   " },
  { q1: "a", q3: ["textbook", "internet"] },
  { q1: "a", q3: ["textbook"] },
  { q1: "a", q3: ["textbook", "paper"] },
  { q1: "a", q3: ["measurement"] },
  { q1: "a", q5: "summary" },
  { q1: "a", q5: "claim" },
  { q1: "a", q6: " 반복 측정 ", q7: "표본 수" },
  { q1: "a", q6: "같은 말", q7: "같은 말" },
  {
    q1: "a",
    q2: "analysis",
    q3: ["internet", "paper", "measurement", "statistics"],
    q4: "THI",
    q5: "claim",
    q6: "더 하기",
    q7: "아쉬움",
  },
];

describe("서버 gaps.ts 와 같은 규칙", () => {
  test.each(CASES.map((c, i) => [i, c] as const))(
    "gapCandidates 케이스 %i 가 서버와 같은 출력이다",
    (_i, answers) => {
      expect(gapCandidates(answers)).toEqual(server.gapCandidates(answers));
    },
  );

  test("validateInterview 가 서버와 같은 출력이다", () => {
    const inputs: [InterviewAnswers, string[]][] = [
      [{ q1: "" }, ["x"]],
      [{ q1: "a" }, []],
      [{ q1: "a" }, ["  "]],
      [{ q1: "a" }, ["x"]],
    ];
    for (const [answers, gaps] of inputs) {
      expect(validateInterview(answers, gaps)).toEqual(
        server.validateInterview(answers, gaps),
      );
    }
  });
});

describe("빈틈 후보 동작", () => {
  test("3번 인터넷 답은 원 출처 후보 1개를 만든다", () => {
    expect(gapCandidates({ q1: "a", q3: ["internet"] })).toEqual([
      { id: "g3-1", text: "원 출처를 확인하지 않고 인용함", source: 3 },
    ]);
  });
});
