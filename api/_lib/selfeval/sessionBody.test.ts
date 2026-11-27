import { describe, expect, it } from "vitest";
import { sessionBasicsSchema } from "../../../shared/selfeval/session.js";
import type { SessionRow } from "./rows.js";
import {
  applySessionPatch,
  buildSessionPatch,
  buildSessionRow,
  canEditBasics,
  normalizeBasics,
  sessionToInput,
  validatePlanItem,
} from "./sessionBody.js";
import type { GrowthSnapshot } from "./types.js";

const valid = {
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: " 생명과학 ",
  activityName: null,
  schoolPrompt: " 탐구 과정을 쓰시오 ",
  teacherNote: "",
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: "의사", department: null, universities: ["가대"] },
  growthApplied: true,
  planItemId: null,
};

function snapshot(over: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  return {
    reportId: "r1",
    issuedAt: "2026-10-01T00:00:00Z",
    narrativeTheme: null,
    gradeSubthemes: [],
    stage: null,
    weakAxes: [],
    alignedSignals: [],
    conflictingSignals: [],
    planItems: [
      { id: "pi1", title: "t", description: null, axis: null, category: null },
    ],
    ...over,
  };
}

function sessionRow(over: Partial<SessionRow> = {}): SessionRow {
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
    target_chars: 500,
    target_chars_mode: "with_space",
    career: { career: null, department: null, universities: [] },
    growth_report_id: null,
    growth_applied: false,
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

describe("학교 문항 없음 왕복", () => {
  it("school_prompt null 이 sessionToInput 에서 null 로 남고 재검증을 통과한다", () => {
    const current = sessionToInput(sessionRow({ school_prompt: null }));
    expect(current.schoolPrompt).toBeNull();
    const r = applySessionPatch(current, { targetChars: 900 });
    expect(r.ok && r.input.schoolPrompt).toBeNull();
    const row = r.ok ? buildSessionPatch(r.input, sessionRow()) : null;
    expect(row?.school_prompt).toBeNull();
  });
});

describe("applySessionPatch", () => {
  it("기존 값에 patch 를 덮고 영역 규칙을 다시 검증한다", () => {
    const current = sessionToInput(sessionRow());
    const ok = applySessionPatch(current, { targetChars: 900 });
    expect(ok.ok && ok.input.targetChars).toBe(900);
    const noName = applySessionPatch(current, { area: "club" });
    expect(noName).toEqual({
      ok: false,
      errors: [{ path: "activityName", message: "활동명을 입력해 주세요." }],
    });
  });

  it("영역을 바꾸면 맞지 않는 쪽 필드를 버린다", () => {
    const current = sessionToInput(sessionRow());
    const club = applySessionPatch(current, {
      area: "club",
      activityName: "로봇부",
    });
    expect(club.ok && club.input).toMatchObject({
      subject: null,
      activityName: "로봇부",
    });
  });
});

describe("normalizeBasics", () => {
  it("창체는 과목을 버리고 교과는 활동명을 버린다", () => {
    const base = sessionBasicsSchema.parse(valid);
    expect(
      normalizeBasics({
        ...base,
        area: "club",
        subject: "무시",
        activityName: "로봇부",
      }),
    ).toMatchObject({ subject: null, activityName: "로봇부" });
    expect(normalizeBasics({ ...base, activityName: "무시" })).toMatchObject({
      subject: "생명과학",
      activityName: null,
    });
  });
});

describe("buildSessionRow", () => {
  const input = normalizeBasics(sessionBasicsSchema.parse(valid));

  it("스냅샷이 없으면 growth_applied 는 false, 연동 키는 null", () => {
    const row = buildSessionRow(input, "u1", { snapshot: null });
    expect(row).toMatchObject({
      profile_id: "u1",
      status: "draft",
      current_step: 1,
      growth_applied: false,
      growth_report_id: null,
      growth_snapshot: null,
      plan_item_id: null,
      area: "subject",
      academic_year: 2026,
    });
  });

  it("스냅샷이 있으면 reportId 와 스냅샷을 고정하고, 계획 항목은 스냅샷 안일 때만 담는다", () => {
    const snap = snapshot();
    const row = buildSessionRow({ ...input, planItemId: "pi1" }, "u1", {
      snapshot: snap,
    });
    expect(row.growth_applied).toBe(true);
    expect(row.growth_report_id).toBe("r1");
    expect(row.growth_snapshot).toBe(snap);
    expect(row.plan_item_id).toBe("pi1");
    const other = buildSessionRow({ ...input, planItemId: "zzz" }, "u1", {
      snapshot: snap,
    });
    expect(other.plan_item_id).toBeNull();
  });

  it("연동을 끈 입력이면 스냅샷이 있어도 growth_applied false", () => {
    const row = buildSessionRow({ ...input, growthApplied: false }, "u1", {
      snapshot: snapshot(),
    });
    expect(row.growth_applied).toBe(false);
  });
});

describe("validatePlanItem", () => {
  const base = { planItemId: "pi1" } as never;
  it("항목이 없으면 통과", () => {
    expect(validatePlanItem({ planItemId: null } as never, null).ok).toBe(true);
  });
  it("스냅샷에 없는 항목은 PLAN_ITEM_INVALID", () => {
    expect(validatePlanItem(base, null)).toMatchObject({
      ok: false,
      code: "PLAN_ITEM_INVALID",
    });
    expect(validatePlanItem(base, snapshot({ planItems: [] }))).toMatchObject({
      ok: false,
    });
  });
  it("스냅샷에 있으면 통과", () => {
    expect(validatePlanItem(base, snapshot()).ok).toBe(true);
  });
});

describe("canEditBasics", () => {
  it("draft 나 in_progress 이고 current_step 1 이하일 때만 true", () => {
    expect(canEditBasics(sessionRow({ current_step: 1 }))).toBe(true);
    expect(
      canEditBasics(sessionRow({ status: "in_progress", current_step: 0 })),
    ).toBe(true);
    expect(canEditBasics(sessionRow({ current_step: 2 }))).toBe(false);
    expect(canEditBasics(sessionRow({ status: "completed" }))).toBe(false);
    expect(canEditBasics(sessionRow({ status: "archived" }))).toBe(false);
  });
});

describe("buildSessionPatch", () => {
  const input = normalizeBasics(sessionBasicsSchema.parse(valid));

  it("세션에 스냅샷이 없으면 growth_applied 를 false 로 둔다", () => {
    const patch = buildSessionPatch(input, sessionRow());
    expect(patch.growth_applied).toBe(false);
    expect(patch.subject).toBe("생명과학");
    expect(patch).not.toHaveProperty("status");
  });

  it("스냅샷이 있으면 입력의 growthApplied 를 따른다", () => {
    const session = sessionRow({ growth_snapshot: snapshot() });
    expect(buildSessionPatch(input, session).growth_applied).toBe(true);
    expect(
      buildSessionPatch({ ...input, growthApplied: false }, session)
        .growth_applied,
    ).toBe(false);
  });

  it("계획 항목은 세션 스냅샷 안일 때만 담는다", () => {
    const session = sessionRow({ growth_snapshot: snapshot() });
    expect(
      buildSessionPatch({ ...input, planItemId: "pi1" }, session).plan_item_id,
    ).toBe("pi1");
    expect(
      buildSessionPatch({ ...input, planItemId: "zz" }, session).plan_item_id,
    ).toBeNull();
  });
});
