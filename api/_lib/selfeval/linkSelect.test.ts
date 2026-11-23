import { describe, expect, it } from "vitest";
import { annotateRows, evaluateSelection } from "./linkSelect.js";
import type { ActivityRecordLike, CandidateRow, RecordLink } from "./types.js";

const rec = (id: string, p: Partial<ActivityRecordLike> = {}) =>
  ({
    id,
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: null,
    semester: null,
    subjectGroup: "수학",
    subject: "수학",
    topic: `주제${id}`,
    concept: null,
    method: null,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

const row = (
  id: string,
  score: number | null,
  p: Partial<ActivityRecordLike> = {},
  same = false,
): CandidateRow => ({
  activity: rec(id, p),
  fit:
    score === null
      ? null
      : {
          activityId: id,
          score,
          signals: [{ key: "same_subject", hit: same, delta: same ? 18 : 0 }],
          reasons: [],
        },
  unavailableReason: score === null ? "계획" : null,
  alreadyUsed: false,
  role: null,
});

const link = (
  fromId: string,
  toId: string,
  p: Partial<RecordLink> = {},
): RecordLink => ({
  fromId,
  toId,
  type: "background",
  strength: "explicit",
  source: "model",
  confirmed: false,
  deleted: false,
  note: null,
  quoteFrom: null,
  quoteTo: null,
  ...p,
});

// 핵심은 topic 만 채운다. 나머지는 핵심에 없는 칸을 채워 기여가 있게 한다.
const core = row("core", 70, {}, true);
const withConcept = (id: string, score: number) =>
  row(id, score, { concept: `개념${id}` });

describe("evaluateSelection with links", () => {
  it("auto-picks only linked records with fit 40+ and a new contribution, ordered by fit plus bonus", () => {
    const rows = [
      core,
      withConcept("a", 60), // 직접 명시 +15 = 75
      row("b", 66, { limitation: "한계" }), // 2단계 명시 +8 = 74
      withConcept("far", 90), // 연계 없음
      withConcept("low", 39), // 임계 미만
      row("dup", 80, { topic: "다른주제" }), // 핵심과 같은 칸만 채움
    ];
    const links = [
      link("core", "a"),
      link("a", "b"),
      link("core", "low"),
      link("core", "dup"),
    ];
    const ev = evaluateSelection(rows, { links, targetChars: 500 });
    expect(ev.coreId).toBe("core");
    expect(ev.supportIds).toEqual(["a", "b"]);
    expect(ev.fallback).toBe(false);
    expect(ev.maxSelect).toBe(7);
    expect(ev.bonus).toMatchObject({ a: 15, b: 8, low: 15, dup: 15 });
    expect(ev.contribution).toMatchObject({ a: 1, b: 1, dup: 0 });
  });

  it("counts a key only once across earlier picks (duplicates are not auto-selected)", () => {
    const rows = [
      core,
      withConcept("a", 60),
      row("b", 61, { concept: "또 개념" }),
    ];
    const links = [link("core", "a"), link("core", "b")];
    const ev = evaluateSelection(rows, { links, targetChars: 500 });
    expect(ev.supportIds).toEqual(["b"]);
    expect(ev.contribution).toMatchObject({ b: 1, a: 0 });
  });

  it("caps the total at N including the core", () => {
    const rows = [
      core,
      ...["a", "b", "c", "d"].map((id, i) =>
        row(id, 60 - i, {
          [["concept", "method", "result", "limitation"][i] as string]: "x",
        }),
      ),
    ];
    const links = ["a", "b", "c", "d"].map((id) => link("core", id));
    expect(
      evaluateSelection(rows, { links, targetChars: 210 }).supportIds,
    ).toHaveLength(2);
    expect(
      evaluateSelection(rows, { links, targetChars: 700 }).supportIds,
    ).toHaveLength(4);
  });

  it("selects only the core when nothing else is linked", () => {
    const ev = evaluateSelection([core, withConcept("a", 90)], {
      links: [],
      targetChars: null,
    });
    expect(ev).toMatchObject({
      coreId: "core",
      supportIds: [],
      fallback: false,
    });
  });

  it("lets a student confirmation raise an implicit link to the explicit score", () => {
    const rows = [
      core,
      withConcept("a", 60),
      row("b", 63, { limitation: "한계" }),
    ];
    const implicit = (confirmed: boolean) => [
      link("core", "a", { strength: "implicit", confirmed }),
      link("core", "b", { strength: "implicit" }),
    ];
    // a: 60 + 10 = 70, b: 63 + 10 = 73
    expect(
      evaluateSelection(rows, { links: implicit(false), targetChars: 500 })
        .supportIds,
    ).toEqual(["b", "a"]);
    // a 확인: 60 + 15 = 75
    const ev = evaluateSelection(rows, {
      links: implicit(true),
      targetChars: 500,
    });
    expect(ev.supportIds).toEqual(["a", "b"]);
    expect(ev.bonus).toMatchObject({ a: 15, b: 10 });
  });

  it("ignores deleted links", () => {
    const ev = evaluateSelection([core, withConcept("a", 60)], {
      links: [link("core", "a", { deleted: true })],
      targetChars: 500,
    });
    expect(ev.supportIds).toEqual([]);
  });

  it("recommends top 3 by fit (core plus 2) but keeps the manual limit at N when the link check is unavailable", () => {
    const rows = [
      core,
      withConcept("a", 90),
      withConcept("b", 80),
      withConcept("c", 75),
    ];
    const ev = evaluateSelection(rows, { links: null, targetChars: 700 });
    expect(ev).toMatchObject({ coreId: "core", fallback: true, maxSelect: 8 });
    expect(ev.supportIds).toEqual(["a", "b"]);
  });
});

describe("evaluateSelection with a chosen core", () => {
  it("builds the graph from the student's core instead of the best-fit core", () => {
    const rows = [
      core,
      row("mine", 50, { concept: "내 개념" }),
      row("a", 60, { limitation: "한계" }),
    ];
    const ev = evaluateSelection(
      rows,
      { links: [link("mine", "a")], targetChars: 500 },
      "mine",
    );
    expect(ev.coreId).toBe("mine");
    expect(ev.coreMismatch).toBe(true);
    expect(ev.supportIds).toEqual(["a"]);
    expect(ev.graph.get("a")?.hop).toBe(1);
  });
});

describe("annotateRows", () => {
  it("adds link state, bonus, contribution and at least one selection reason per usable row", () => {
    const rows = [
      core,
      withConcept("a", 60),
      withConcept("far", 50),
      row("p", null),
    ];
    const links = [link("core", "a", { type: "deepen" })];
    const ev = evaluateSelection(rows, { links, targetChars: 500 });
    const out = annotateRows(rows, ev);
    const by = (id: string) => out.find((r) => r.activity.id === id);
    expect(by("a")?.linkState).toEqual({
      linked: true,
      hop: 1,
      type: "deepen",
      strength: "explicit",
      confirmed: false,
    });
    expect(by("a")?.bonus).toBe(15);
    expect(by("a")?.contribution).toBe(1);
    expect(by("a")?.selectionReasons).toContain(
      "핵심 기록과 직접 이어져요 (같은 질문 심화)",
    );
    expect(by("far")?.linkState).toEqual({
      linked: false,
      hop: null,
      type: null,
      strength: null,
      confirmed: false,
    });
    expect(by("core")?.linkState).toMatchObject({ linked: true, hop: 0 });
    for (const id of ["core", "a", "far"]) {
      expect(by(id)?.selectionReasons?.length).toBeGreaterThan(0);
    }
    expect(by("p")?.linkState).toBeNull();
    expect(by("p")?.selectionReasons).toEqual([]);
  });

  it("states the hop count for farther links", () => {
    const rows = [core, withConcept("a", 60), withConcept("b", 60)];
    const ev = evaluateSelection(rows, {
      links: [link("core", "a"), link("a", "b", { type: "inherit" })],
      targetChars: 500,
    });
    expect(
      annotateRows(rows, ev).find((r) => r.activity.id === "b")
        ?.selectionReasons,
    ).toContain("핵심 기록에서 2단계 거쳐 이어져요 (이어받음)");
  });

  it("leaves every state empty when linking was not checked", () => {
    const rows = [core, withConcept("a", 60)];
    const ev = evaluateSelection(rows, { links: null, targetChars: 500 });
    const out = annotateRows(rows, ev);
    expect(
      out.every((r) => r.linkState === null || r.linkState === undefined),
    ).toBe(true);
  });
});
