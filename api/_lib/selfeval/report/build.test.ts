import { describe, expect, it } from "vitest";
import { buildReport } from "./build.js";
import { sampleInput } from "./sample.testkit.js";

describe("buildReport", () => {
  it("reproduces the v4.2 sample facts from code values alone", () => {
    const { payload, tagMap } = buildReport(sampleInput(), null);
    const math = payload.ch02.subjects[0];
    expect(math?.counts).toEqual({ performance: 2, deep: 2, activity: 0 });
    expect(math?.inProgress.deep).toBe(1);
    expect(math?.reflectedSentenceCount).toBe(8);
    expect(payload.ch03.rows.map((r) => r.tag)).toEqual([
      "P1",
      "P2",
      "D1",
      "D3",
    ]);
    expect(payload.ch04?.reflectedCount).toBe(4);
    expect(payload.ch04?.sentenceNumbers).toEqual([1, 3, 6, 9]);
    expect(payload.ch05.counts).toMatchObject({
      completedReports: 7,
      subjectCount: 4,
      reflectedReports: 6,
      reflectedMemos: 4,
    });
    expect(payload.ch05.cards.selfeval.text).toBe(
      "9문장 중 9문장 모두 근거 연결 완료",
    );
    expect(tagMap.P1).toBe("rec-p1");
  });

  it("carries no student name anywhere in the payload", () => {
    const json = JSON.stringify(buildReport(sampleInput(), null).payload);
    expect(json).not.toContain("QA학생");
    expect(json).not.toContain("studentName");
  });

  it("marks the compose texts as missing when none were given and fills them when given", () => {
    const first = buildReport(sampleInput(), null);
    expect(first.payload.composeMissing).toBe(true);
    expect(first.needs.length).toBeGreaterThan(0);
    const texts = Object.fromEntries(
      first.needs.map((n) => [n.id, `문장 ${n.id}`]),
    );
    const done = buildReport(sampleInput(), texts);
    expect(done.payload.composeMissing).toBe(false);
    expect(done.payload.ch03.rows[0]?.explanation).toBe("문장 relation:P1");
    expect(done.payload.ch04?.summary).toContain("문장 memoRate");
  });

  it("flags a partial compose when some needs have no text", () => {
    const first = buildReport(sampleInput(), null);
    expect(first.payload.composePartial).toBe(false);
    const [kept, ...rest] = first.needs;
    expect(rest.length).toBeGreaterThan(0);
    const part = buildReport(sampleInput(), {
      [(kept as { id: string }).id]: "문장",
    });
    expect(part.payload.composeMissing).toBe(false);
    expect(part.payload.composePartial).toBe(true);
    const all = buildReport(
      sampleInput(),
      Object.fromEntries(first.needs.map((n) => [n.id, "문장"])),
    );
    expect(all.payload.composePartial).toBe(false);
  });

  it("drops chapter 04 and has no memo needs without confirmed memos", () => {
    const { payload, needs } = buildReport(sampleInput({ memos: [] }), null);
    expect(payload.ch04).toBeNull();
    expect(needs.some((n) => n.id.startsWith("memo"))).toBe(false);
  });

  it("needs no compose when nothing needs a sentence", () => {
    const input = sampleInput({
      records: sampleInput().records.filter((r) => r.id === "rec-p1"),
      memos: [],
      bodySections: {
        paragraphs: [
          {
            sentences: [
              {
                text: "문장.",
                evidence: [
                  {
                    sourceType: "P",
                    refId: "rec-p1",
                    item: "method",
                    weight: "main",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const first = buildReport(input, null);
    const own = first.needs.filter((n) => n.kind !== "relation");
    expect(own).toEqual([]);
  });
});
