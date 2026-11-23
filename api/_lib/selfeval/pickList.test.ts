import { describe, expect, it } from "vitest";
import { composePickList, linkStatusOf, unlinkedIds } from "./pickList.js";
import type { ActivityRecordLike, CandidateRow, RecordLink } from "./types.js";

const row = (
  id: string,
  score: number | null,
  p: Partial<ActivityRecordLike> = {},
  same = false,
): CandidateRow => ({
  activity: {
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
  } as ActivityRecordLike,
  fit:
    score === null
      ? null
      : {
          activityId: id,
          score,
          signals: [{ key: "same_subject", hit: same, delta: 0 }],
          reasons: [],
        },
  unavailableReason: null,
  alreadyUsed: false,
  role: null,
});

const link = (fromId: string, toId: string): RecordLink => ({
  fromId,
  toId,
  type: "deepen",
  strength: "explicit",
  source: "model",
  confirmed: false,
  deleted: false,
  note: null,
  quoteFrom: "a",
  quoteTo: "b",
});

const rows = [
  row("core", 70, {}, true),
  row("a", 60, { concept: "x" }),
  row("far", 80, { concept: "y" }),
];

describe("linkStatusOf", () => {
  const state = (status: string) => ({
    steps: {
      link: {
        status,
        attempts: 1,
        startedAt: null,
        finishedAt: null,
        issues: [],
      },
    },
  });
  it("maps the stored link step onto pending, ok and unchecked", () => {
    expect(linkStatusOf({})).toBe("pending");
    expect(linkStatusOf(state("running"))).toBe("pending");
    expect(linkStatusOf(state("ok"))).toBe("ok");
    expect(linkStatusOf(state("failed"))).toBe("unchecked");
  });
});

describe("composePickList", () => {
  it("after a checked link step recommends linked records, with N, links and no fallback", () => {
    const out = composePickList({
      rows,
      links: [link("core", "a")],
      status: "ok",
      selection: null,
      targetChars: 500,
    });
    expect(out.auto).toMatchObject({ coreId: "core", supportIds: ["a"] });
    expect(out.maxSelect).toBe(7);
    expect(out.linkUnchecked).toBe(false);
    expect(out.linkStatus).toBe("ok");
    expect(out.links).toHaveLength(1);
    const by = (id: string) => out.candidates.find((r) => r.activity.id === id);
    expect(by("a")?.role).toBe("support");
    expect(by("far")?.linkState?.linked).toBe(false);
  });

  it("falls back to top 3 by fit and flags linkUnchecked when the link call failed", () => {
    const out = composePickList({
      rows,
      links: [],
      status: "unchecked",
      selection: null,
      targetChars: 700,
    });
    expect(out.linkUnchecked).toBe(true);
    expect(out.maxSelect).toBe(3);
    expect(out.auto).toMatchObject({
      coreId: "core",
      supportIds: ["far", "a"],
    });
    expect(out.candidates.every((r) => !r.linkState)).toBe(true);
    expect(
      out.candidates.every((r) => r.bonus === undefined || r.bonus === 0),
    ).toBe(true);
  });

  it("keeps pending (not yet judged) separate from unchecked", () => {
    const out = composePickList({
      rows,
      links: [],
      status: "pending",
      selection: null,
      targetChars: 500,
    });
    expect(out.linkUnchecked).toBe(false);
    expect(out.linkStatus).toBe("pending");
    expect(out.maxSelect).toBe(3);
  });

  it("uses the student's selection, builds the map from its core and lists unlinked picks as excluded", () => {
    const out = composePickList({
      rows,
      links: [link("core", "a")],
      status: "ok",
      selection: { coreId: "core", supportIds: ["a", "far"] },
      targetChars: 500,
    });
    expect(out.auto).toBeNull();
    expect(out.excludedIds).toEqual(["far"]);
    expect(out.candidates.find((r) => r.activity.id === "far")?.role).toBe(
      "support",
    );
  });

  it("does not exclude anything when links were not checked", () => {
    const out = composePickList({
      rows,
      links: [],
      status: "unchecked",
      selection: { coreId: "core", supportIds: ["far"] },
      targetChars: 500,
    });
    expect(out.excludedIds).toEqual([]);
  });
});

describe("unlinkedIds", () => {
  it("returns selected supports that the core component does not reach", () => {
    expect(unlinkedIds([link("core", "a")], "core", ["a", "far"])).toEqual([
      "far",
    ]);
  });
});
