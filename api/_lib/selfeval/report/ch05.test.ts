import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh02 } from "./ch02.js";
import { buildCh04 } from "./ch04.js";
import { buildCh05 } from "./ch05.js";
import { sampleInput } from "./sample.testkit.js";

function run(
  over: Parameters<typeof sampleInput>[0] = {},
  text: (id: string) => string | null = () => null,
) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  const ch02 = buildCh02(input, body, text);
  const ch04 = buildCh04(input, body, ch02, text);
  return buildCh05(input, body, ch02, ch04, text);
}

describe("buildCh05 counts", () => {
  it("counts completed reports with subjects, reflected reports, reflected memos and linked subjects", () => {
    expect(run().counts).toEqual({
      completedReports: 7,
      subjectCount: 4,
      reflectedReports: 6,
      reflectedMemos: 4,
      linkedSubjects: ["수학", "정보", "통합사회"],
    });
  });

  it("counts no memos when the student has none", () => {
    expect(run({ memos: [] }).counts.reflectedMemos).toBe(0);
  });
});

describe("buildCh05 cards", () => {
  it("lists performance and deep tags with subjects and notes the in-progress deep record", () => {
    const { cards } = run();
    expect(cards.performance.items).toEqual([
      { tag: "P1", subject: "수학" },
      { tag: "P2", subject: "수학" },
      { tag: "P3", subject: "정보" },
      { tag: "P4", subject: "통합사회" },
    ]);
    expect(cards.inquiry.items).toEqual([
      { tag: "D1", subject: "수학" },
      { tag: "D3", subject: "통합사회" },
    ]);
    expect(cards.inquiry.inProgressTags).toEqual(["D2"]);
  });

  it("shows the self evaluation completion as 9 of 9 and appends the done suffix only when all are linked", () => {
    expect(run().cards.selfeval).toEqual({
      total: 9,
      linked: 9,
      allLinked: true,
      text: "9문장 중 9문장 모두 근거 연결 완료",
    });
    const partial = run({
      bodySections: {
        paragraphs: [
          {
            sentences: [
              {
                text: "가.",
                evidence: [
                  {
                    sourceType: "P",
                    refId: "rec-p1",
                    item: "method",
                    weight: "main",
                  },
                ],
              },
              { text: "나.", evidence: [] },
            ],
          },
        ],
      },
    }).cards.selfeval;
    expect(partial).toMatchObject({
      total: 2,
      linked: 1,
      allLinked: false,
      text: "2문장 중 1문장 근거 연결",
    });
  });

  it("maps stage sources to ok, none and error cards without failing the report", () => {
    const { cards } = run({
      stages: {
        diagnosis: {
          state: "ok",
          value: { sentence: "진단 문장", date: "2026.03.04" },
        },
        goal: { state: "error" },
        growth: { state: "none" },
      },
    });
    expect(cards.diagnosis).toEqual({
      state: "ok",
      text: "진단 문장",
      date: "2026.03.04",
    });
    expect(cards.goal).toEqual({ state: "error", text: null, date: null });
    expect(cards.growth).toEqual({ state: "none", text: null, date: null });
  });
});

describe("buildCh05 next steps", () => {
  it("picks candidates in the fixed order and stops at four", () => {
    const steps = run({ topImprovement: "개선 문장" }).nextSteps;
    expect(steps.map((s) => [s.key, s.tag])).toEqual([
      ["memo_detail", "H3"],
      ["finish_in_progress", "D2"],
      ["verify_action", "H4"],
      ["use_elsewhere", "P5"],
    ]);
    expect(steps.every((s) => s.text === null)).toBe(true);
  });

  it("takes each sentence from the composed text", () => {
    const steps = run({}, (id) =>
      id === "next:finish_in_progress" ? "문장" : null,
    ).nextSteps;
    expect(steps.find((s) => s.key === "finish_in_progress")?.text).toBe(
      "문장",
    );
  });

  it("uses the top verification improvement tagged with the most cited record when nothing else applies", () => {
    const steps = run({
      records: sampleInput().records.filter(
        (r) => r.id !== "rec-d2" && r.id !== "rec-p5",
      ),
      memos: [],
      topImprovement: "근거 보강",
    }).nextSteps;
    expect(steps.map((s) => [s.key, s.tag])).toEqual([
      ["verification_fix", "P1"],
    ]);
  });
});
