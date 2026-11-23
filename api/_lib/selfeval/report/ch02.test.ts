import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh02 } from "./ch02.js";
import type { ReportLink } from "./inputs.js";
import { sampleInput } from "./sample.testkit.js";

function run(over: Parameters<typeof sampleInput>[0] = {}) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  return buildCh02(input, body, () => null);
}

const row = (r: ReturnType<typeof run>, tag: string) =>
  r.ch02.subjects.flatMap((s) => s.rows).find((x) => x.tag === tag);

describe("buildCh02 subjects and counts", () => {
  it("orders the writing subject first, reflected subjects by earliest submit date, unreflected last", () => {
    const r = run();
    expect(r.ch02.subjects.map((s) => s.subject)).toEqual([
      "수학",
      "정보",
      "통합사회",
      "국어",
    ]);
  });

  it("counts the math header as 수행 2, 심화 2 with 1 in progress and 8 reflected sentences", () => {
    const math = run().ch02.subjects[0];
    expect(math?.label).toBe("수학 (공통수학1)");
    expect(math?.counts).toEqual({ performance: 2, deep: 2, activity: 0 });
    expect(math?.inProgress.deep).toBe(1);
    expect(math?.reflectedSentenceCount).toBe(8);
    expect(run().ch02.subjects[1]?.label).toBe("정보");
  });

  it("numbers tags by subject order then submit date and keeps memos by written date", () => {
    const r = run();
    expect(r.ch02.subjects.flatMap((s) => s.rows.map((x) => x.tag))).toEqual([
      "P1",
      "P2",
      "D1",
      "D2",
      "P3",
      "P4",
      "D3",
      "P5",
    ]);
    expect(r.tagMap.H1).toBe("log-1");
    expect(r.tagMap.H5).toBe("log-5");
    expect(r.tagMap.P3).toBe("rec-p3");
  });

  it("keeps stored tags and gives a new record the next number", () => {
    const first = run();
    const extra = {
      ...(sampleInput().records[0] as never),
      id: "rec-new",
      subject: "수학",
      submittedAt: "2026-01-01T00:00:00.000Z",
    };
    const again = run({
      tagMap: first.tagMap,
      records: [...sampleInput().records, extra],
    });
    expect(again.tagMap.P1).toBe("rec-p1");
    expect(again.tagMap.P6).toBe("rec-new");
  });
});

describe("buildCh02 rows", () => {
  it("labels P1 and D1 as core, P2 as main, with sentence numbers and dots", () => {
    const r = run();
    expect(row(r, "P1")).toMatchObject({
      role: "core",
      roleLabel: "핵심 근거",
      sentenceNumbers: [1, 2, 5, 8],
      dots: 4,
      submittedOn: "2026.06.18",
    });
    expect(row(r, "P2")).toMatchObject({
      role: "main",
      sentenceNumbers: [3, 5],
      dots: 3,
    });
    expect(row(r, "D1")).toMatchObject({
      role: "core",
      sentenceNumbers: [4, 6, 7],
      dots: 4,
    });
  });

  it("labels other subjects by the most used item", () => {
    const r = run();
    expect(row(r, "P3")).toMatchObject({
      role: "support",
      roleLabel: "보조 근거 (교과 연계)",
      dots: 1,
    });
    expect(row(r, "P4")).toMatchObject({ role: "indirect", dots: 1 });
    expect(row(r, "D3")).toMatchObject({
      role: "reflection",
      roleLabel: "성찰 근거 (교과 연계)",
      sentenceNumbers: [9],
    });
  });

  it("shows an in-progress record with no reflection and no date", () => {
    expect(row(run(), "D2")).toMatchObject({
      role: "in_progress",
      roleLabel: "진행 중, 반영 안 함",
      inProgress: true,
      submittedOn: null,
      dots: 0,
      sentenceNumbers: [],
    });
  });

  it("marks an unreflected record with a reason code and a recommendation for a subject with no self evaluation", () => {
    expect(row(run(), "P5")).toMatchObject({
      role: "unreflected",
      reasonCode: "other_subject",
      reasonLabel: "다른 과목 소재",
      recommendation: "국어 자기평가 추천",
      dots: 0,
    });
    expect(
      row(run({ completedSubjects: ["수학", "국어"] }), "P5")?.recommendation,
    ).toBeNull();
  });

  it("lets a link type override the rule based label", () => {
    const links: ReportLink[] = [
      {
        fromRecordId: "rec-p1",
        toRecordId: "rec-d1",
        linkType: "deepen",
        strength: "explicit",
      },
      {
        fromRecordId: "rec-d1",
        toRecordId: "rec-p3",
        linkType: "background",
        strength: "implicit",
      },
      {
        fromRecordId: "rec-p1",
        toRecordId: "rec-d3",
        linkType: "borrow_method",
        strength: "implicit",
      },
    ];
    const r = run({ links });
    expect(row(r, "P3")?.role).toBe("indirect");
    expect(row(r, "D3")?.role).toBe("support");
    expect(row(r, "D1")?.role).toBe("core");
  });

  it("uses the record summary when present and the composed text otherwise", () => {
    const input = sampleInput();
    const body = readBody(input.bodySections, input);
    const r = buildCh02(input, body, (id) =>
      id === "summary:P5"
        ? "요약 문장"
        : id === "reason:P5"
          ? "이유 문장"
          : null,
    );
    expect(row(r, "P1")?.summary).toBe(input.records[0]?.summary);
    expect(row(r, "P5")?.summary).toBe("요약 문장");
    expect(row(r, "P5")?.reasonText).toBe("이유 문장");
    expect(row(r, "D2")?.summary).toBeNull();
  });
});
