// 성장설계 회차 세션 규칙 테스트(No.115, 138, 139). 순수 함수만 다룬다.
import { describe, expect, test } from "vitest";
import {
  decideOpenReport,
  deriveResumeStep,
  type GrowthReportRow,
  markStepState,
  summarizeOpenReport,
} from "./reportSession.js";

const NOW = "2026-10-06T00:00:00.000Z";

function row(over: Partial<GrowthReportRow> & { id: string }): GrowthReportRow {
  return {
    status: "in_progress",
    current_step: 0,
    track: null,
    step_state: {},
    survey_answers: null,
    activity_ids: [],
    grade_inputs: null,
    ledger_id: null,
    ledger_reversed_at: null,
    model_attempt_count: 0,
    last_activity_at: "2026-10-01T00:00:00.000Z",
    issued_at: "2026-09-30T00:00:00.000Z",
    ...over,
  };
}

describe("decideOpenReport (No.115, 138, 139)", () => {
  test("90일 미만 미완 행이 여럿이면 last_activity_at 이 최신인 행을 재사용한다", () => {
    const rows = [
      row({ id: "a", last_activity_at: "2026-09-01T00:00:00.000Z" }),
      row({
        id: "b",
        status: "draft",
        last_activity_at: "2026-10-02T00:00:00.000Z",
      }),
      row({ id: "c", last_activity_at: "2026-09-20T00:00:00.000Z" }),
    ];
    const d = decideOpenReport(rows, NOW);
    expect(d.kind).toBe("reuse");
    if (d.kind === "reuse") expect(d.report.id).toBe("b");
  });

  test("90일 이상 지난 미완 행만 있으면 그 id 들을 만료 대상으로 돌려준다(정확히 90일은 만료)", () => {
    const rows = [
      row({ id: "old1", last_activity_at: "2026-07-08T00:00:00.000Z" }),
      row({
        id: "old2",
        status: "draft",
        last_activity_at: "2026-06-01T00:00:00.000Z",
      }),
      row({
        id: "done",
        status: "completed",
        last_activity_at: "2026-10-05T00:00:00.000Z",
      }),
    ];
    expect(decideOpenReport(rows, NOW)).toEqual({
      kind: "expire_and_create",
      expiredIds: ["old1", "old2"],
    });
  });

  test("89일째 행은 아직 재사용한다", () => {
    const d = decideOpenReport(
      [row({ id: "x", last_activity_at: "2026-07-09T00:00:00.000Z" })],
      NOW,
    );
    expect(d.kind).toBe("reuse");
  });

  test("미완 행이 없으면 새로 만든다", () => {
    expect(decideOpenReport([], NOW)).toEqual({ kind: "create" });
    expect(
      decideOpenReport([row({ id: "d", status: "completed" })], NOW),
    ).toEqual({ kind: "create" });
  });
});

describe("deriveResumeStep", () => {
  test("완료된 회차는 report 단계다", () => {
    expect(
      deriveResumeStep(row({ id: "a", status: "completed", current_step: 8 })),
    ).toEqual({ resumeStep: 8, phase: "report" });
  });

  test("current_step 0 이고 트랙이 없으면 survey, 있으면 collect", () => {
    expect(deriveResumeStep(row({ id: "a" }))).toEqual({
      resumeStep: 0,
      phase: "survey",
    });
    expect(deriveResumeStep(row({ id: "a", track: "고2" }))).toEqual({
      resumeStep: 0,
      phase: "collect",
    });
  });

  test("1~7 단계는 done 최대 단계 + 1 과 current_step 중 큰 값에서 generating 을 이어간다", () => {
    const step_state = {
      "1": { status: "done", attempts: 1 },
      "2": { status: "done", attempts: 1 },
      "3": { status: "done", attempts: 1 },
      "4": { status: "failed", attempts: 2 },
    };
    expect(
      deriveResumeStep(row({ id: "a", current_step: 2, step_state })),
    ).toEqual({ resumeStep: 4, phase: "generating" });
    expect(
      deriveResumeStep(row({ id: "a", current_step: 6, step_state })),
    ).toEqual({ resumeStep: 6, phase: "generating" });
  });

  test("done 이 7단계면 상한 8 에서 멈춘다", () => {
    const step_state = { "7": { status: "done", attempts: 1 } };
    expect(
      deriveResumeStep(row({ id: "a", current_step: 7, step_state })),
    ).toEqual({ resumeStep: 8, phase: "generating" });
  });

  test("8단계인데 completed 가 아니면 generating 8", () => {
    expect(deriveResumeStep(row({ id: "a", current_step: 8 }))).toEqual({
      resumeStep: 8,
      phase: "generating",
    });
  });
});

describe("summarizeOpenReport (미완 회차 카드 문구)", () => {
  test("설문 단계는 답한 문항 수를 보여준다", () => {
    expect(summarizeOpenReport(row({ id: "a" }), 13, 24)).toEqual({
      startedAt: "2026-09-30T00:00:00.000Z",
      lastSavedAt: "2026-10-01T00:00:00.000Z",
      stepLabel: "2단계 학생 조사 24문항 중 13문항 답함",
    });
  });

  test("활동 선택 단계 문구", () => {
    expect(
      summarizeOpenReport(row({ id: "a", track: "고2" }), 24, 24).stepLabel,
    ).toBe("3단계 활동 선택");
  });

  test("생성 단계는 완료된 단계 수를 N/8 로 보여준다", () => {
    const step_state = {
      "1": { status: "done", attempts: 1 },
      "2": { status: "done", attempts: 1 },
      "3": { status: "running", attempts: 1 },
    };
    expect(
      summarizeOpenReport(
        row({ id: "a", track: "고2", current_step: 3, step_state }),
        24,
        24,
      ).stepLabel,
    ).toBe("4단계 리포트 생성 2/8");
  });
});

describe("markStepState", () => {
  test("prev 가 객체가 아니면 빈 상태에서 시작해 해당 단계만 채운다", () => {
    expect(markStepState(null, 1, { status: "running" })).toEqual({
      "1": { status: "running", attempts: 0 },
    });
  });

  test("해당 단계만 병합하고 다른 단계는 유지하며 increment 면 attempts 가 1 늘어난다", () => {
    const prev = {
      "1": { status: "done", attempts: 1 },
      "2": { status: "failed", attempts: 2, error: "x" },
    };
    const next = markStepState(prev, 2, {
      status: "running",
      error: null,
      increment: true,
    });
    expect(next).toEqual({
      "1": { status: "done", attempts: 1 },
      "2": { status: "running", attempts: 3, error: null },
    });
  });

  test("입력 객체를 바꾸지 않는다", () => {
    const prev = { "1": { status: "pending", attempts: 0 } };
    const snapshot = JSON.parse(JSON.stringify(prev));
    markStepState(prev, 1, { status: "done", increment: true });
    expect(prev).toEqual(snapshot);
  });
});
