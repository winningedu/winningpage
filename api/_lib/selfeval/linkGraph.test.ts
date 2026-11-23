import { describe, expect, it } from "vitest";
import {
  buildLinkGraph,
  filledKeys,
  linkBonus,
  maxSelectFor,
  newKeys,
} from "./linkGraph.js";
import type { ActivityRecordLike, RecordLink } from "./types.js";

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

describe("buildLinkGraph", () => {
  it("counts hops from the core over undirected accepted links", () => {
    const g = buildLinkGraph(
      [link("core", "a"), link("b", "a"), link("c", "b"), link("x", "y")],
      "core",
    );
    expect(g.get("core")?.hop).toBe(0);
    expect(g.get("a")?.hop).toBe(1);
    expect(g.get("b")?.hop).toBe(2);
    expect(g.get("c")?.hop).toBe(3);
    expect(g.has("x")).toBe(false);
    expect(g.has("y")).toBe(false);
  });

  it("ignores deleted links and never resurrects them", () => {
    const g = buildLinkGraph(
      [link("core", "a", { deleted: true }), link("core", "b")],
      "core",
    );
    expect(g.has("a")).toBe(false);
    expect(g.has("b")).toBe(true);
  });

  it("reports the edge it reached a record by and prefers a stronger edge at the same hop", () => {
    const g = buildLinkGraph(
      [
        link("core", "a", { type: "background", strength: "implicit" }),
        link("core", "z", { type: "inherit" }),
        link("z", "a", { type: "deepen", strength: "explicit" }),
        link("core", "a", { type: "complement", strength: "explicit" }),
      ],
      "core",
    );
    expect(g.get("a")).toMatchObject({
      hop: 1,
      type: "complement",
      strength: "explicit",
      confirmed: false,
    });
  });
});

describe("linkBonus", () => {
  it("scores direct 15 (implicit unconfirmed 10), two hops 8 (5), three or more 0", () => {
    expect(linkBonus(1, "explicit", false)).toBe(15);
    expect(linkBonus(1, "implicit", false)).toBe(10);
    expect(linkBonus(2, "explicit", false)).toBe(8);
    expect(linkBonus(2, "implicit", false)).toBe(5);
    expect(linkBonus(3, "explicit", false)).toBe(0);
    expect(linkBonus(4, "implicit", true)).toBe(0);
  });

  it("upgrades a confirmed implicit link to the explicit score", () => {
    expect(linkBonus(1, "implicit", true)).toBe(15);
    expect(linkBonus(2, "implicit", true)).toBe(8);
  });
});

describe("maxSelectFor", () => {
  it("is min(8, floor(target / 70)) with a floor of 3 and null counted as 500", () => {
    expect(maxSelectFor(500)).toBe(7);
    expect(maxSelectFor(210)).toBe(3);
    expect(maxSelectFor(100)).toBe(3);
    expect(maxSelectFor(700)).toBe(8);
    expect(maxSelectFor(2000)).toBe(8);
    expect(maxSelectFor(null)).toBe(7);
  });
});

const rec = (p: Partial<ActivityRecordLike>) =>
  ({
    id: "r",
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: null,
    semester: null,
    subjectGroup: null,
    subject: null,
    topic: null,
    concept: null,
    method: null,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

describe("contribution keys", () => {
  it("maps the seven record items onto the eleven analysis keys", () => {
    expect(
      [
        ...filledKeys(
          rec({
            topic: "t",
            concept: "c",
            method: "m",
            result: "r",
            limitation: "l",
            numbers: ["3"],
            sources: ["s"],
          }),
        ),
      ].sort(),
    ).toEqual([
      "action",
      "concept",
      "limitation",
      "method",
      "motive",
      "result",
    ]);
    expect([...filledKeys(rec({ topic: "t" }))]).toEqual(["motive"]);
    expect([...filledKeys(rec({ sources: ["s"] }))]).toEqual(["method"]);
    expect([...filledKeys(rec({ numbers: ["3"] }))]).toEqual(["result"]);
    expect([...filledKeys(rec({ method: "m" })).values()].sort()).toEqual([
      "action",
      "method",
    ]);
  });

  it("counts only keys that earlier picked records did not already fill", () => {
    const covered = filledKeys(rec({ topic: "t", concept: "c" }));
    const r = rec({ topic: "t2", concept: "c2", limitation: "l" });
    expect([...newKeys(r, covered)]).toEqual(["limitation"]);
    expect(newKeys(rec({ topic: "x" }), covered).size).toBe(0);
  });
});
