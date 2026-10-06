import { describe, expect, it } from "vitest";
import {
  applySelection,
  assignRoles,
  autoSelect,
  buildCandidates,
  type PickContext,
  sourceCounts,
} from "./pick.js";
import type { ActivityRecordLike, CandidateRow, FitResult } from "./types.js";

const rec = (
  id: string,
  o: Partial<ActivityRecordLike> = {},
): ActivityRecordLike => ({
  id,
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고2",
  semester: 1,
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
  ...o,
});

const ctx = (
  o: Partial<Omit<PickContext, "others">> = {},
): Omit<PickContext, "others"> => ({
  area: "subject",
  subject: "수학",
  activityName: null,
  growth: null,
  growthApplied: false,
  usedActivityIds: new Set(),
  ...o,
});

describe("buildCandidates", () => {
  it("self 는 제외하고 planned 는 점수 없이 사유를 단다", () => {
    const rows = buildCandidates(
      [
        rec("a"),
        rec("s", { sourceProgram: "self" }),
        rec("p", { status: "planned" }),
      ],
      ctx(),
    );
    expect(rows.map((r) => r.activity.id).sort()).toEqual(["a", "p"]);
    const p = rows.find((r) => r.activity.id === "p");
    expect(p?.fit).toBeNull();
    expect(p?.unavailableReason).toBe(
      "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
    );
    const a = rows.find((r) => r.activity.id === "a");
    expect(a?.fit?.activityId).toBe("a");
    expect(a?.unavailableReason).toBeNull();
    expect(a?.role).toBeNull();
  });
  it("최신순 20건으로 자른다", () => {
    const recs = Array.from({ length: 25 }, (_, i) =>
      rec(`r${i}`, {
        createdAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const rows = buildCandidates(recs, ctx());
    expect(rows).toHaveLength(20);
    expect(rows[0]?.activity.id).toBe("r24");
    expect(rows.at(-1)?.activity.id).toBe("r5");
  });
  it("이미 쓴 활동 표시", () => {
    const rows = buildCandidates(
      [rec("a"), rec("b")],
      ctx({ usedActivityIds: new Set(["b"]) }),
    );
    expect(rows.find((r) => r.activity.id === "b")?.alreadyUsed).toBe(true);
    expect(rows.find((r) => r.activity.id === "a")?.alreadyUsed).toBe(false);
  });
  it("자기 제외 나머지를 others 로 넘겨 같은 제목이면 repeated_topic", () => {
    const rows = buildCandidates(
      [
        rec("a", { topic: "표본 조사 설계" }),
        rec("b", { topic: "표본 조사 설계" }),
      ],
      ctx(),
    );
    expect(
      rows[0]?.fit?.signals.find((s) => s.key === "repeated_topic")?.hit,
    ).toBe(true);
  });
});

const mkFit = (id: string, score: number, same: boolean): FitResult => ({
  activityId: id,
  score,
  signals: [{ key: "same_subject", hit: same, delta: same ? 18 : 0 }],
  reasons: [],
});
const row = (
  id: string,
  score: number | null,
  same = false,
  o: Partial<CandidateRow> = {},
): CandidateRow => ({
  activity: rec(id),
  fit: score === null ? null : mkFit(id, score, same),
  unavailableReason: score === null ? "계획" : null,
  alreadyUsed: false,
  role: null,
  ...o,
});

describe("autoSelect", () => {
  it("작성 과목 활동 중 최고점이 핵심, 보조는 나머지 상위 2", () => {
    const r = autoSelect(
      [
        row("a", 90, false),
        row("b", 50, true),
        row("c", 70, true),
        row("d", 60),
        row("e", 45),
      ],
      ctx(),
    );
    expect(r).toEqual({
      coreId: "c",
      supportIds: ["a", "d"],
      coreMismatch: false,
      noneAboveThreshold: false,
    });
  });
  it("작성 과목 활동이 없으면 전체 최고점이 핵심이고 coreMismatch", () => {
    const r = autoSelect([row("a", 90), row("b", 50)], ctx());
    expect(r.coreId).toBe("a");
    expect(r.coreMismatch).toBe(true);
    expect(r.supportIds).toEqual(["b"]);
  });
  it("40 미만은 대상이 아니다", () => {
    const r = autoSelect([row("a", 39, true), row("p", null)], ctx());
    expect(r).toEqual({
      coreId: null,
      supportIds: [],
      coreMismatch: false,
      noneAboveThreshold: true,
    });
  });
  it("정확히 40 은 대상", () => {
    expect(autoSelect([row("a", 40, true)], ctx()).coreId).toBe("a");
  });
});

describe("applySelection", () => {
  const rows = [
    row("a", 90),
    row("b", 60, true),
    row("c", 50),
    row("d", 45),
    row("p", null),
  ];
  it("핵심이 작성 과목이 아니고 선택 안에 작성 과목 활동이 있으면 바꾼다", () => {
    const r = applySelection(
      rows,
      { coreId: "a", supportIds: ["b", "c"] },
      ctx(),
    );
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.coreId).toBe("b");
    expect(r.supportIds.sort()).toEqual(["a", "c"]);
    expect(r.coreMismatch).toBe(false);
  });
  it("작성 과목 활동이 선택에 없으면 그대로 두고 coreMismatch", () => {
    const r = applySelection(rows, { coreId: "a", supportIds: ["c"] }, ctx());
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.coreId).toBe("a");
    expect(r.coreMismatch).toBe(true);
  });
  it("핵심이 비면 CORE_REQUIRED", () => {
    const r = applySelection(rows, { coreId: "", supportIds: [] }, ctx());
    expect(r).toMatchObject({ ok: false, code: "CORE_REQUIRED" });
  });
  it("모르는 활동은 UNKNOWN_ACTIVITY", () => {
    expect(
      applySelection(rows, { coreId: "zz", supportIds: [] }, ctx()),
    ).toMatchObject({ ok: false, code: "UNKNOWN_ACTIVITY" });
    expect(
      applySelection(rows, { coreId: "a", supportIds: ["zz"] }, ctx()),
    ).toMatchObject({ ok: false, code: "UNKNOWN_ACTIVITY" });
  });
  it("계획 활동은 UNAVAILABLE", () => {
    expect(
      applySelection(rows, { coreId: "a", supportIds: ["p"] }, ctx()),
    ).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });
  it("보조 3개는 TOO_MANY_SUPPORT", () => {
    expect(
      applySelection(rows, { coreId: "a", supportIds: ["b", "c", "d"] }, ctx()),
    ).toMatchObject({ ok: false, code: "TOO_MANY_SUPPORT" });
  });
  it("보조에 핵심이 섞여 있거나 중복이면 걸러서 센다", () => {
    const r = applySelection(
      rows,
      { coreId: "a", supportIds: ["a", "c", "c"] },
      ctx(),
    );
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.supportIds).toEqual(["c"]);
  });
  it("이미 쓴 활동은 경고만 하고 허용", () => {
    const used = [row("a", 90, true, { alreadyUsed: true }), row("c", 50)];
    const r = applySelection(used, { coreId: "a", supportIds: ["c"] }, ctx());
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.warnings).toContain("이전 자기평가서에서 쓴 활동이에요");
  });
});

describe("assignRoles", () => {
  it("핵심, 보조, 나머지 null 로 복사본을 만든다", () => {
    const rows = [row("a", 90), row("b", 60), row("c", 50)];
    const out = assignRoles(rows, "a", ["b"]);
    expect(out.map((r) => r.role)).toEqual(["core", "support", null]);
    expect(rows[0]?.role).toBeNull();
  });
});

describe("sourceCounts", () => {
  it("self 를 빼고 출처별로 센다", () => {
    const c = sourceCounts([
      rec("1"),
      rec("2", { sourceProgram: "deep" }),
      rec("3", { sourceProgram: "manual" }),
      rec("4", { sourceProgram: "self" }),
      rec("5", { sourceProgram: "upload" }),
    ]);
    expect(c).toEqual({ performance: 1, deep: 1, manual: 1, total: 4 });
  });
});
