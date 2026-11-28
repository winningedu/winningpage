import { describe, expect, it } from "vitest";
import {
  canChangeSelection,
  manualSelectionRow,
  pickContextFrom,
  STEP_AFTER_MANUAL_PICK,
  STEP_AFTER_PICK,
  selectionRows,
} from "./pickBody.js";
import type { SessionRow } from "./rows.js";
import type {
  ActivityRecordLike,
  CandidateRow,
  GrowthSnapshot,
} from "./types.js";

function session(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    profile_id: "u1",
    status: "draft",
    current_step: 1,
    academic_year: 2026,
    grade_label: "고2",
    semester: 1,
    area: "subject",
    subject: "생명과학",
    activity_name: null,
    school_prompt: "문항",
    teacher_note: null,
    target_chars: null,
    target_chars_mode: "with_space",
    career: {},
    growth_report_id: null,
    growth_applied: true,
    growth_snapshot: null,
    plan_item_id: null,
    reply_pending: null,
    regenerate_count: 0,
    step_state: {},
    ledger_id: null,
    ledger_reversed_at: null,
    last_activity_at: "2026-10-01T00:00:00Z",
    completed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("pickContextFrom", () => {
  it("스냅샷이 없으면 growthApplied 는 false", () => {
    const ctx = pickContextFrom(session(), new Set(["x"]));
    expect(ctx).toMatchObject({
      area: "subject",
      subject: "생명과학",
      activityName: null,
      growth: null,
      growthApplied: false,
    });
    expect(ctx.usedActivityIds.has("x")).toBe(true);
  });

  it("스냅샷이 있고 연동이면 그대로 담는다", () => {
    const snap = { reportId: "r" } as GrowthSnapshot;
    const ctx = pickContextFrom(session({ growth_snapshot: snap }), new Set());
    expect(ctx.growth).toBe(snap);
    expect(ctx.growthApplied).toBe(true);
    expect(
      pickContextFrom(
        session({ growth_snapshot: snap, growth_applied: false }),
        new Set(),
      ).growthApplied,
    ).toBe(false);
  });
});

function candidate(id: string, score: number | null): CandidateRow {
  return {
    activity: { id } as ActivityRecordLike,
    fit:
      score === null
        ? null
        : { activityId: id, score, signals: [], reasons: ["이유"] },
    unavailableReason: null,
    alreadyUsed: false,
    role: null,
  };
}

describe("selectionRows", () => {
  it("핵심과 보조를 insert 행으로 만든다", () => {
    const rows = selectionRows(
      "s1",
      "u1",
      [candidate("a", 70), candidate("b", 55), candidate("c", 30)],
      "a",
      ["b"],
    );
    expect(rows).toEqual([
      {
        session_id: "s1",
        profile_id: "u1",
        activity_record_id: "a",
        role: "core",
        fit_score: 70,
        fit_reasons: { signals: [], reasons: ["이유"] },
        analysis: null,
        analysis_source: null,
      },
      {
        session_id: "s1",
        profile_id: "u1",
        activity_record_id: "b",
        role: "support",
        fit_score: 55,
        fit_reasons: { signals: [], reasons: ["이유"] },
        analysis: null,
        analysis_source: null,
      },
    ]);
  });
});

describe("canChangeSelection / STEP_AFTER_PICK", () => {
  it("분석 전(단계 2 이하)까지만 바꿀 수 있다", () => {
    expect(canChangeSelection(session({ current_step: 2 }))).toBe(true);
    expect(canChangeSelection(session({ current_step: 3 }))).toBe(false);
    expect(canChangeSelection(session({ status: "completed" }))).toBe(false);
  });
  it("선택은 단계 2 이하에서만 바뀌므로 활동 선택 확정은 늘 단계 2다", () => {
    expect(STEP_AFTER_PICK).toBe(2);
    for (const step of [0, 1, 2] as const) {
      expect(canChangeSelection(session({ current_step: step }))).toBe(true);
      expect(step).toBeLessThanOrEqual(STEP_AFTER_PICK);
    }
  });
  it("직접 입력 선택은 분석 산출물이 이미 있어 늘 단계 3으로 올린다", () => {
    expect(STEP_AFTER_MANUAL_PICK).toBe(3);
  });
});

describe("manualSelectionRow", () => {
  it("직접 입력은 핵심 1건, 적합도 없음, 학생 분석으로 저장한다", () => {
    const analysis = { values: {}, sources: {}, conflicts: [] } as never;
    expect(manualSelectionRow("s1", "u1", "a1", analysis)).toEqual({
      session_id: "s1",
      profile_id: "u1",
      activity_record_id: "a1",
      role: "core",
      fit_score: null,
      fit_reasons: null,
      analysis,
      analysis_source: "student",
    });
  });
});
