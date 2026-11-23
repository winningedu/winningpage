import { describe, expect, it } from "vitest";
import { buildLinkGraph, linkBonus } from "./linkGraph.js";
import { buildLinkPrompt, validateLinkResponse } from "./linkPrompt.js";
import type { ActivityRecordLike } from "./types.js";
import { LINK_TYPE_LABELS, LINK_TYPES } from "./types.js";

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
    concept: `개념${id} 공통개념`,
    method: `방법${id}`,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-02-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

const core = rec("core", { submittedAt: "2026-03-01T00:00:00Z" });
const input = (others: ActivityRecordLike[]) => ({
  core,
  others,
  area: "subject" as const,
  subject: "수학",
  activityName: null,
});
// 인용은 각 기록의 concept 필드 전체다. 공통개념이 겹쳐 4조건을 만족한다.
const yes = (from: string, to: string, p: Record<string, unknown> = {}) => ({
  from,
  to,
  linked: true,
  link_type: "background",
  strength: "implicit",
  quote_from: `개념${from === "R0" ? "core" : from.replace("R", "o")} 공통개념`,
  quote_to: `개념${to === "R0" ? "core" : to.replace("R", "o")} 공통개념`,
  ...p,
});
const others = (n: number) =>
  Array.from({ length: n }, (_, i) => rec(`o${i + 1}`));

describe("buildLinkPrompt", () => {
  it("labels the core R0 and candidates R1.., with the seven types, strength rules and the same-material warning", () => {
    const p = buildLinkPrompt(input(others(2)), []);
    expect(p.user).toContain("R0");
    expect(p.user).toContain("R2");
    expect(p.user).toContain("개념o1 공통개념");
    for (const t of LINK_TYPES) {
      expect(p.system).toContain(t);
      expect(p.system).toContain(LINK_TYPE_LABELS[t]);
    }
    expect(p.system).toContain(
      "같은 소재(예: 매점)만 겹치는 것은 연계가 아니다",
    );
    expect(p.system).toContain("explicit");
    expect(p.system).toContain("implicit");
    expect(p.maxOutputTokens).toBeGreaterThan(0);
    expect(p.responseSchema).toMatchObject({ type: "object" });
  });

  it("restricts types for creative-area sessions", () => {
    const p = buildLinkPrompt(
      { ...input(others(1)), area: "club", subject: null },
      [],
    );
    expect(p.user).toContain("borrow_method, background, area_extend");
  });

  it("appends retry notes", () => {
    expect(buildLinkPrompt(input(others(1)), ["형식 오류"]).user).toContain(
      "형식 오류",
    );
  });
});

describe("validateLinkResponse", () => {
  it("accepts a pass 1 link between the core and a candidate", () => {
    const v = validateLinkResponse(
      { judgments: [yes("R0", "R1")] },
      input(others(2)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links).toEqual([
      {
        fromId: "core",
        toId: "o1",
        type: "background",
        strength: "implicit",
        source: "model",
        confirmed: false,
        deleted: false,
        note: null,
        quoteFrom: "개념core 공통개념",
        quoteTo: "개념o1 공통개념",
      },
    ]);
  });

  it("drops a model yes that the code rejects and reports the reason", () => {
    const v = validateLinkResponse(
      { judgments: [yes("R0", "R1", { quote_to: "없는 인용" })] },
      input(others(1)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links).toEqual([]);
    expect(v.rejected).toEqual([
      { fromId: "core", toId: "o1", reason: "quote_missing" },
    ]);
  });

  it("ignores linked:false entries and unknown refs", () => {
    const v = validateLinkResponse(
      { judgments: [yes("R0", "R1", { linked: false }), yes("R0", "R9")] },
      input(others(1)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links).toEqual([]);
  });

  it("keeps a pass 2 pair when at least one record passed pass 1, so the other becomes a two hop record", () => {
    const v = validateLinkResponse(
      {
        judgments: [
          yes("R0", "R1"),
          yes("R0", "R2"),
          yes("R1", "R2"),
          yes("R1", "R3"),
        ],
      },
      input(others(3)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    const pairs = v.links.map((l) => `${l.fromId}>${l.toId}`);
    // o3 는 1차를 통과하지 못했지만 통과한 o1 과 이어지므로 o1 을 거친 2단계 기록이 된다(명세 No.174).
    expect(pairs).toEqual(["core>o1", "core>o2", "o1>o2", "o1>o3"]);
    const graph = buildLinkGraph(v.links, "core");
    expect(graph.get("o3")?.hop).toBe(2);
    const o3 = graph.get("o3");
    // 2단계 연계는 명시 +8, 암묵 +5(명세 No.179).
    expect(
      linkBonus(2, o3?.strength ?? "implicit", o3?.confirmed ?? false),
    ).toBe(o3?.strength === "explicit" ? 8 : 5);
  });

  it("drops a pass 2 pair when neither record passed pass 1", () => {
    const v = validateLinkResponse(
      {
        judgments: [yes("R0", "R1"), yes("R2", "R3")],
      },
      input(others(3)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links.map((l) => `${l.fromId}>${l.toId}`)).toEqual(["core>o1"]);
  });

  it("limits pass 2 to pairs that touch the first eight records that passed pass 1", () => {
    const os = others(10);
    const judgments = [
      ...os.slice(0, 9).map((_, i) => yes("R0", `R${i + 1}`)),
      yes("R1", "R8"),
      yes("R1", "R9"),
      yes("R9", "R10"),
      yes("R1", "R10"),
    ];
    const v = validateLinkResponse({ judgments }, input(os));
    if (!v.ok) throw new Error("ok 여야 한다");
    const pairs = v.links.map((l) => `${l.fromId}>${l.toId}`);
    expect(pairs).toContain("o1>o8");
    expect(pairs).toContain("o1>o9");
    expect(pairs).not.toContain("o9>o10");
    expect(pairs).toContain("o1>o10");
    expect(pairs).toContain("core>o9");
  });

  it("keeps one link per unordered pair", () => {
    const v = validateLinkResponse(
      {
        judgments: [
          yes("R0", "R1"),
          yes("R1", "R0", { link_type: "complement" }),
        ],
      },
      input(others(1)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links).toHaveLength(1);
  });

  it("treats an unknown strength as implicit", () => {
    const v = validateLinkResponse(
      { judgments: [yes("R0", "R1", { strength: "maybe" })] },
      input(others(1)),
    );
    if (!v.ok) throw new Error("ok 여야 한다");
    expect(v.links[0]?.strength).toBe("implicit");
  });

  it("fails on a malformed response", () => {
    for (const bad of [null, [], {}, { judgments: "x" }]) {
      expect(validateLinkResponse(bad, input(others(1)))).toMatchObject({
        ok: false,
        issues: [{ code: "link_shape" }],
      });
    }
  });
});
