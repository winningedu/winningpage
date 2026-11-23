import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh01, buildCover } from "./ch01.js";
import { buildCh02 } from "./ch02.js";
import { sampleInput } from "./sample.testkit.js";

function run(over: Parameters<typeof sampleInput>[0] = {}) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  const ch02 = buildCh02(input, body, () => null);
  return { input, ch01: buildCh01(input, body, ch02) };
}

describe("buildCh01", () => {
  it("gives every sentence a number and its tags in evidence order, main first", () => {
    const { ch01 } = run();
    const all = ch01.paragraphs.flatMap((p) => p.sentences);
    expect(all.map((s) => s.tags.join(" "))).toEqual([
      "H1 P1",
      "P1",
      "P2 H2 P4",
      "D1",
      "P2 P1",
      "P3 H3 D1",
      "D1",
      "P1",
      "D3 H4",
    ]);
    expect(all.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("counts paragraphs, sentences and the difference from the target to one decimal", () => {
    const { ch01 } = run();
    expect(ch01).toMatchObject({
      charCount: { withSpace: 493, withoutSpace: 380 },
      targetChars: 500,
      diffPercent: -1.4,
      paragraphCount: 3,
      sentenceCount: 9,
    });
  });

  it("measures the difference by the chosen counting mode and has no difference without a target", () => {
    expect(
      run({
        session: {
          ...sampleInput().session,
          targetChars: 400,
          targetCharsMode: "without_space",
        },
      }).ch01.diffPercent,
    ).toBe(-5);
    expect(
      run({ session: { ...sampleInput().session, targetChars: null } }).ch01
        .diffPercent,
    ).toBeNull();
  });

  it("flags a sentence with no evidence as needing confirmation", () => {
    const { ch01 } = run({
      bodySections: {
        paragraphs: [{ sentences: [{ text: "문장.", evidence: [] }] }],
      },
    });
    expect(ch01.paragraphs[0]?.sentences[0]).toMatchObject({
      tags: [],
      needsConfirm: true,
    });
  });
});

describe("buildCover", () => {
  it("shows grade, final save date, tier, subject title and used steps without a student name", () => {
    const cover = buildCover(sampleInput());
    expect(cover).toEqual({
      gradeLabel: "고등학교 1학년",
      savedAt: "2026. 11. 10",
      serviceTier: "individual",
      subjectTitle: "수학 자기평가서",
      academicYear: 2026,
      steps: sampleInput().steps,
    });
  });

  it("leaves the tier null when it is not set and never invents a label", () => {
    expect(
      buildCover(sampleInput({ serviceTier: null })).serviceTier,
    ).toBeNull();
  });

  it("titles a non subject session by its activity name", () => {
    const cover = buildCover(
      sampleInput({
        session: {
          ...sampleInput().session,
          area: "club",
          subject: null,
          activityName: "과학 동아리",
        },
      }),
    );
    expect(cover.subjectTitle).toBe("과학 동아리 자기평가서");
  });

  it("throws when the session has no subject or activity name", () => {
    expect(() =>
      buildCover(
        sampleInput({
          session: { ...sampleInput().session, subject: null },
        }),
      ),
    ).toThrow();
  });
});
