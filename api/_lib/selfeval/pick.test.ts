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

describe("buildCandidates v4.2", () => {
  it("수행, 심화, 직접 입력만 후보이고 업로드와 자기평가서 기록은 뺀다", () => {
    const rows = buildCandidates(
      [
        rec("a"),
        rec("d", { sourceProgram: "deep" }),
        rec("m", { sourceProgram: "manual" }),
        rec("u", { sourceProgram: "upload" }),
        rec("s", { sourceProgram: "self" }),
      ],
      ctx(),
    );
    expect(rows.map((r) => r.activity.id).sort()).toEqual(["a", "d", "m"]);
  });
  it("record_status 가 completed 가 아니면 이유를 달고 쓸 수 없게 한다", () => {
    const rows = buildCandidates(
      [
        rec("c"),
        rec("i", { recordStatus: "in_progress" }),
        rec("p", { recordStatus: "plan" }),
        rec("x", { status: "planned" }),
      ],
      ctx(),
    );
    const by = (id: string) => rows.find((r) => r.activity.id === id);
    expect(by("c")?.recordStatus).toBe("completed");
    expect(by("c")?.fit).not.toBeNull();
    expect(by("i")?.recordStatus).toBe("in_progress");
    expect(by("i")?.fit).toBeNull();
    expect(by("i")?.unavailableReason).toBe(
      "아직 진행 중인 기록이라 근거로 쓸 수 없어요",
    );
    expect(by("p")?.unavailableReason).toBe(
      "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
    );
    expect(by("x")?.recordStatus).toBe("plan");
  });
  it("제출일을 쓰고 없으면 createdAt 으로 읽어 최신순으로 놓는다", () => {
    const rows = buildCandidates(
      [
        rec("old", {
          createdAt: "2026-09-01T00:00:00Z",
          submittedAt: "2026-01-01T00:00:00Z",
        }),
        rec("new", {
          createdAt: "2026-02-01T00:00:00Z",
          submittedAt: "2026-08-01T00:00:00Z",
        }),
        rec("mid", { createdAt: "2026-05-01T00:00:00Z" }),
      ],
      ctx(),
    );
    expect(rows.map((r) => r.activity.id)).toEqual(["new", "mid", "old"]);
    expect(rows[1]?.submittedAt).toBe("2026-05-01T00:00:00Z");
  });
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
  it("작성 과목 활동은 40 미만이어도 핵심이 된다", () => {
    const r = autoSelect(
      [row("a", 39, true), row("b", 45), row("p", null)],
      ctx(),
    );
    expect(r).toEqual({
      coreId: "a",
      supportIds: ["b"],
      coreMismatch: false,
      noneAboveThreshold: false,
    });
  });
  it("작성 과목 활동이 없고 40 이상도 없으면 자동 선택이 없다", () => {
    const r = autoSelect([row("a", 39), row("p", null)], ctx());
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
      3,
    );
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.coreId).toBe("b");
    expect(r.supportIds.sort()).toEqual(["a", "c"]);
    expect(r.coreMismatch).toBe(false);
  });
  it("작성 과목 활동이 선택에 없으면 그대로 두고 coreMismatch", () => {
    const r = applySelection(
      rows,
      { coreId: "a", supportIds: ["c"] },
      ctx(),
      3,
    );
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.coreId).toBe("a");
    expect(r.coreMismatch).toBe(true);
  });
  it("핵심이 비면 CORE_REQUIRED", () => {
    const r = applySelection(rows, { coreId: "", supportIds: [] }, ctx(), 3);
    expect(r).toMatchObject({ ok: false, code: "CORE_REQUIRED" });
  });
  it("모르는 활동은 UNKNOWN_ACTIVITY", () => {
    expect(
      applySelection(rows, { coreId: "zz", supportIds: [] }, ctx(), 3),
    ).toMatchObject({ ok: false, code: "UNKNOWN_ACTIVITY" });
    expect(
      applySelection(rows, { coreId: "a", supportIds: ["zz"] }, ctx(), 3),
    ).toMatchObject({ ok: false, code: "UNKNOWN_ACTIVITY" });
  });
  it("계획 활동은 UNAVAILABLE", () => {
    expect(
      applySelection(rows, { coreId: "a", supportIds: ["p"] }, ctx(), 3),
    ).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });
  it("보조 3개는 TOO_MANY_SUPPORT", () => {
    expect(
      applySelection(
        rows,
        { coreId: "a", supportIds: ["b", "c", "d"] },
        ctx(),
        3,
      ),
    ).toMatchObject({ ok: false, code: "TOO_MANY_SUPPORT" });
  });
  it("선택 상한을 넘기면 N 을 넣은 메시지로 거절한다", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((id) => row(id, 60));
    const r = applySelection(
      many,
      { coreId: "a", supportIds: ["b", "c", "d", "e", "f"] },
      ctx(),
      5,
    );
    expect(r).toEqual({
      ok: false,
      code: "TOO_MANY_SUPPORT",
      message: "활동은 최대 5건까지 고를 수 있어요.",
    });
    expect(
      applySelection(
        many,
        { coreId: "a", supportIds: ["b", "c", "d", "e"] },
        ctx(),
        5,
      ).ok,
    ).toBe(true);
  });
  it("보조에 핵심이 섞여 있거나 중복이면 걸러서 센다", () => {
    const r = applySelection(
      rows,
      { coreId: "a", supportIds: ["a", "c", "c"] },
      ctx(),
      3,
    );
    if (!r.ok) throw new Error("ok 여야 한다");
    expect(r.supportIds).toEqual(["c"]);
  });
  it("이미 쓴 활동은 경고만 하고 허용", () => {
    const used = [row("a", 90, true, { alreadyUsed: true }), row("c", 50)];
    const r = applySelection(
      used,
      { coreId: "a", supportIds: ["c"] },
      ctx(),
      3,
    );
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
