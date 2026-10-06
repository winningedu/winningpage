import { describe, expect, it } from "vitest";
import {
  canRecover,
  cloneForRecovery,
  validateRecoverBody,
} from "./recover.js";

const terminal = {
  reason: "3단계 시도 상한 초과",
  at: "2026-10-02T00:00:00Z",
  step: 3,
};
const row = {
  id: "r1",
  profile_id: "p1",
  status: "archived",
  track: "고2",
  survey_answers: { a: 1 },
  activity_ids: ["x", "y"],
  grade_inputs: { g: 2 },
  step_state: { steps: {}, terminal },
};

describe("validateRecoverBody", () => {
  it("reportId 가 uuid 여야 한다", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(validateRecoverBody({ reportId: id })).toEqual({
      ok: true,
      reportId: id,
    });
    expect(validateRecoverBody({ reportId: "x" }).ok).toBe(false);
    expect(validateRecoverBody(null).ok).toBe(false);
  });
});

describe("canRecover", () => {
  it("archived 이고 terminal 이 있으면 가능하다", () => {
    expect(canRecover(row)).toEqual({ ok: true });
  });

  it("archived 가 아니면 NOT_RECOVERABLE", () => {
    expect(canRecover({ ...row, status: "completed" })).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("terminal 이 없는 archived(학생이 지운 회차 등)는 NOT_RECOVERABLE", () => {
    expect(canRecover({ ...row, step_state: {} })).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("이미 복구한 회차는 ALREADY_RECOVERED", () => {
    expect(
      canRecover({
        ...row,
        step_state: { steps: {}, terminal, recoveredTo: "r2" },
      }),
    ).toEqual({ ok: false, code: "ALREADY_RECOVERED" });
  });
});

describe("cloneForRecovery", () => {
  const now = "2026-10-06T00:00:00.000Z";

  it("입력 재료를 복제하고 진행 상태와 차감 정보는 비운다", () => {
    expect(cloneForRecovery(row, now)).toEqual({
      profile_id: "p1",
      track: "고2",
      survey_answers: { a: 1 },
      activity_ids: ["x", "y"],
      grade_inputs: { g: 2 },
      status: "in_progress",
      current_step: 0,
      step_state: {},
      last_activity_at: now,
    });
  });

  it("원본 배열을 공유하지 않는다", () => {
    const c = cloneForRecovery(row, now);
    expect(c.activity_ids).not.toBe(row.activity_ids);
  });
});
