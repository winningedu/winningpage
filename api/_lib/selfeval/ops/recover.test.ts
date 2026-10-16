import { describe, expect, it } from "vitest";
import {
  canRecover,
  cloneActivitiesForRecovery,
  cloneSessionForRecovery,
  type RecoverSourceRow,
  validateRecoverBody,
} from "./recover.js";

const terminal = {
  reason: "discarded",
  at: "2026-10-02T00:00:00Z",
  step: null,
};
const row: RecoverSourceRow = {
  id: "s1",
  profile_id: "p1",
  status: "archived",
  current_step: 4,
  academic_year: 2026,
  grade_label: "고2",
  semester: 1,
  area: "subject",
  subject: "물리학",
  activity_name: null,
  school_prompt: "문항",
  teacher_note: "요구",
  target_chars: 500,
  target_chars_mode: "with_space",
  career: { career: "의사" },
  growth_report_id: "g1",
  growth_applied: true,
  growth_snapshot: { a: 1 },
  plan_item_id: "pi1",
  step_state: { steps: {}, terminal },
};

describe("validateRecoverBody", () => {
  it("sessionId 가 uuid 여야 한다", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(validateRecoverBody({ sessionId: id })).toEqual({
      ok: true,
      sessionId: id,
    });
    expect(validateRecoverBody({ sessionId: "x" }).ok).toBe(false);
    expect(validateRecoverBody(null).ok).toBe(false);
  });
});

describe("canRecover", () => {
  it("archived 이고 terminal 이 있으면 가능하다(파기 포함)", () => {
    expect(canRecover(row)).toEqual({ ok: true });
  });

  it("archived 가 아니면 NOT_RECOVERABLE", () => {
    expect(canRecover({ ...row, status: "completed" })).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("terminal 이 없으면 NOT_RECOVERABLE", () => {
    expect(canRecover({ ...row, step_state: {} })).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("이미 복구한 세션은 ALREADY_RECOVERED", () => {
    expect(
      canRecover({
        ...row,
        step_state: { steps: {}, terminal, recoveredTo: "s2" },
      }),
    ).toEqual({ ok: false, code: "ALREADY_RECOVERED" });
  });
});

describe("cloneSessionForRecovery", () => {
  it("기본 입력을 복제하고 진행, 차감 정보는 비운다", () => {
    const c = cloneSessionForRecovery(row, "2026-10-06T00:00:00.000Z");
    expect(c).toMatchObject({
      profile_id: "p1",
      status: "draft",
      current_step: 2,
      academic_year: 2026,
      grade_label: "고2",
      semester: 1,
      area: "subject",
      subject: "물리학",
      school_prompt: "문항",
      teacher_note: "요구",
      target_chars: 500,
      target_chars_mode: "with_space",
      career: { career: "의사" },
      growth_report_id: "g1",
      growth_applied: true,
      growth_snapshot: { a: 1 },
      plan_item_id: "pi1",
      step_state: {},
      last_activity_at: "2026-10-06T00:00:00.000Z",
    });
    expect(c).not.toHaveProperty("ledger_id");
    expect(c).not.toHaveProperty("id");
  });

  it("원본이 1단계 이하면 1단계로 시작한다", () => {
    expect(
      cloneSessionForRecovery({ ...row, current_step: 1 }, "t").current_step,
    ).toBe(1);
    expect(
      cloneSessionForRecovery({ ...row, current_step: 0 }, "t").current_step,
    ).toBe(1);
    expect(
      cloneSessionForRecovery({ ...row, current_step: 2 }, "t").current_step,
    ).toBe(2);
  });
});

describe("cloneActivitiesForRecovery", () => {
  it("새 세션 id 로 활동과 분석을 복제한다", () => {
    const out = cloneActivitiesForRecovery(
      [
        {
          activity_record_id: "r1",
          role: "core",
          fit_score: 80,
          fit_reasons: { x: 1 },
          analysis: { values: {} },
          analysis_source: "model",
        },
      ],
      "s2",
      "p1",
    );
    expect(out).toEqual([
      {
        session_id: "s2",
        profile_id: "p1",
        activity_record_id: "r1",
        role: "core",
        fit_score: 80,
        fit_reasons: { x: 1 },
        analysis: { values: {} },
        analysis_source: "model",
      },
    ]);
  });
});
