import { describe, expect, it } from "vitest";
import type { SessionRow } from "./rows.js";
import {
  applySessionPatch,
  buildSessionPatch,
  buildSessionRow,
  canEditBasics,
  readSessionAction,
  sessionToInput,
  validatePlanItem,
  validateSessionCreateBody,
  validateSessionDiscardBody,
  validateSessionUpdateBody,
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

describe("validateSessionCreateBody", () => {
  it("정상 바디를 trim 해서 SessionInput 으로 돌려준다", () => {
    const r = validateSessionCreateBody(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.subject).toBe("생명과학");
    expect(r.input.schoolPrompt).toBe("탐구 과정을 쓰시오");
    expect(r.input.teacherNote).toBeNull();
    expect(r.input.activityName).toBeNull();
  });

  it("교과인데 과목이 없으면 SUBJECT_REQUIRED", () => {
    const r = validateSessionCreateBody({ ...valid, subject: "  " });
    expect(r).toMatchObject({ ok: false, code: "SUBJECT_REQUIRED" });
  });

  it("창체인데 활동명이 없으면 ACTIVITY_NAME_REQUIRED", () => {
    const r = validateSessionCreateBody({
      ...valid,
      area: "club",
      subject: null,
      activityName: "",
    });
    expect(r).toMatchObject({ ok: false, code: "ACTIVITY_NAME_REQUIRED" });
  });

  it("창체는 과목을 버린다", () => {
    const r = validateSessionCreateBody({
      ...valid,
      area: "club",
      subject: "무시",
      activityName: "로봇부",
    });
    expect(r.ok && r.input.subject).toBeNull();
    expect(r.ok && r.input.activityName).toBe("로봇부");
  });

  it("학교 문항이 공백이면 PROMPT_REQUIRED", () => {
    const r = validateSessionCreateBody({ ...valid, schoolPrompt: "   " });
    expect(r).toMatchObject({ ok: false, code: "PROMPT_REQUIRED" });
  });

  it.each([99, 3001, 500.5, "500"])("목표 글자 수 %s 는 거절", (v) => {
    const r = validateSessionCreateBody({ ...valid, targetChars: v });
    expect(r).toMatchObject({ ok: false, code: "TARGET_CHARS_INVALID" });
  });

  it("목표 글자 수 null 과 경계값 100, 3000 은 통과", () => {
    for (const v of [null, 100, 3000]) {
      expect(validateSessionCreateBody({ ...valid, targetChars: v }).ok).toBe(
        true,
      );
    }
  });

  it("희망 대학은 최대 2개 문자열", () => {
    const r = validateSessionCreateBody({
      ...valid,
      career: { career: null, department: null, universities: ["a", "b", "c"] },
    });
    expect(r).toMatchObject({ ok: false, code: "CAREER_INVALID" });
    const r2 = validateSessionCreateBody({
      ...valid,
      career: { career: null, department: null, universities: [1] },
    });
    expect(r2).toMatchObject({ ok: false, code: "CAREER_INVALID" });
  });

  it("학년, 학기, 영역, 학년도, 글자 수 기준이 잘못되면 각 코드로 거절", () => {
    expect(
      validateSessionCreateBody({ ...valid, gradeLabel: "고4" }),
    ).toMatchObject({ code: "GRADE_INVALID" });
    expect(validateSessionCreateBody({ ...valid, semester: 3 })).toMatchObject({
      code: "SEMESTER_INVALID",
    });
    expect(validateSessionCreateBody({ ...valid, area: "x" })).toMatchObject({
      code: "AREA_INVALID",
    });
    expect(
      validateSessionCreateBody({ ...valid, academicYear: 1999 }),
    ).toMatchObject({ code: "ACADEMIC_YEAR_INVALID" });
    expect(
      validateSessionCreateBody({ ...valid, targetCharsMode: "x" }),
    ).toMatchObject({ code: "TARGET_MODE_INVALID" });
  });

  it("객체가 아니면 INVALID_BODY", () => {
    expect(validateSessionCreateBody(null)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });
});

describe("validateSessionUpdateBody", () => {
  it("sessionId 가 없으면 거절", () => {
    expect(validateSessionUpdateBody({})).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });

  it("보낸 필드만 patch 에 담는다", () => {
    const r = validateSessionUpdateBody({ sessionId: "s1", targetChars: 800 });
    expect(r).toEqual({
      ok: true,
      sessionId: "s1",
      patch: { targetChars: 800 },
    });
  });

  it("보낸 필드의 규칙 위반은 같은 코드로 거절", () => {
    expect(
      validateSessionUpdateBody({ sessionId: "s1", schoolPrompt: " " }),
    ).toMatchObject({ ok: false, code: "PROMPT_REQUIRED" });
  });
});

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

describe("applySessionPatch", () => {
  it("기존 값에 patch 를 덮고 영역 규칙을 다시 검증한다", () => {
    const current = sessionToInput(sessionRow());
    const ok = applySessionPatch(current, { targetChars: 900 });
    expect(ok.ok && ok.input.targetChars).toBe(900);
    const bad = applySessionPatch(current, { area: "club" });
    expect(bad).toMatchObject({ ok: false, code: "ACTIVITY_NAME_REQUIRED" });
  });
});

describe("buildSessionRow", () => {
  const parsed = validateSessionCreateBody(valid);
  const input = parsed.ok ? parsed.input : (undefined as never);

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
  const parsed = validateSessionCreateBody(valid);
  const input = parsed.ok ? parsed.input : (undefined as never);

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

describe("readSessionAction / validateSessionDiscardBody", () => {
  it("action 이 create, update, discard 가 아니면 null", () => {
    expect(readSessionAction({ action: "create" })).toBe("create");
    expect(readSessionAction({ action: "update" })).toBe("update");
    expect(readSessionAction({ action: "discard" })).toBe("discard");
    expect(readSessionAction({ action: "x" })).toBeNull();
    expect(readSessionAction(null)).toBeNull();
  });

  it("discard 는 sessionId 가 있어야 한다", () => {
    expect(validateSessionDiscardBody({ sessionId: "s1" })).toEqual({
      ok: true,
      sessionId: "s1",
    });
    expect(validateSessionDiscardBody({})).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });
});
