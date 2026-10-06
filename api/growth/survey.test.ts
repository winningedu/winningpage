// 성장설계 설문 엔드포인트의 순수 조립 함수 테스트. 핸들러 본문은 DB 에 묶여 있어 다루지 않는다.
import { describe, expect, test } from "vitest";
import { SURVEY_QUESTIONS } from "../_lib/growth/intake/survey.js";
import {
  buildSurveyBootstrap,
  nextSurveyWrite,
  type SurveyBootstrapInput,
  type SurveyReportRow,
  validateSurveyPostBody,
} from "./survey.js";

const REPORT_ID = "0b6f3c2e-5d1a-4c3b-8a9e-1f2d3c4b5a69";

describe("validateSurveyPostBody", () => {
  test("reportId 없이 올바른 answers 는 통과한다", () => {
    const result = validateSurveyPostBody({ answers: { q1: "최근 일" } });
    expect(result).toEqual({
      ok: true,
      body: { reportId: undefined, patch: { q1: "최근 일" } },
    });
  });

  test("reportId 가 uuid 이면 그대로 담긴다", () => {
    const result = validateSurveyPostBody({
      reportId: REPORT_ID,
      answers: { q3: "둘 다" },
    });
    expect(result).toEqual({
      ok: true,
      body: { reportId: REPORT_ID, patch: { q3: "둘 다" } },
    });
  });

  test("reportId 형식이 틀리면 실패한다", () => {
    const result = validateSurveyPostBody({
      reportId: "not-a-uuid",
      answers: { q1: "a" },
    });
    expect(result.ok).toBe(false);
  });

  test("answers 가 잘못되면 사유와 함께 실패한다", () => {
    const result = validateSurveyPostBody({ answers: { q3: "없는 선택지" } });
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("q3"),
    });
    expect(validateSurveyPostBody({}).ok).toBe(false);
    expect(validateSurveyPostBody(null).ok).toBe(false);
  });
});

describe("nextSurveyWrite", () => {
  const NOW = "2026-10-06T00:00:00.000Z";

  test("미완 회차가 없으면 draft 행을 새로 만든다", () => {
    const write = nextSurveyWrite({
      openRow: null,
      patch: { q1: "첫 답" },
      nowIso: NOW,
    });
    expect(write).toEqual({
      kind: "insert",
      row: {
        status: "draft",
        current_step: 0,
        survey_answers: { q1: "첫 답" },
        last_activity_at: NOW,
      },
    });
  });

  test("미완 회차가 있으면 기존 답에 병합해 갱신한다", () => {
    const write = nextSurveyWrite({
      openRow: {
        id: REPORT_ID,
        survey_answers: { q1: "옛 답", q2: "유지" },
      },
      patch: { q1: "새 답", q3: "둘 다" },
      nowIso: NOW,
    });
    expect(write).toEqual({
      kind: "update",
      id: REPORT_ID,
      row: {
        survey_answers: { q1: "새 답", q2: "유지", q3: "둘 다" },
        last_activity_at: NOW,
        updated_at: NOW,
      },
    });
  });

  test("null 값은 해당 문항을 비운다", () => {
    const write = nextSurveyWrite({
      openRow: { id: REPORT_ID, survey_answers: { q1: "a", q2: "b" } },
      patch: { q1: null },
      nowIso: NOW,
    });
    expect(write.kind === "update" && write.row.survey_answers).toEqual({
      q2: "b",
    });
  });
});

const NOW_ISO = "2026-10-06T00:00:00.000Z";

function bootstrapInput(
  over: Partial<SurveyBootstrapInput> = {},
): SurveyBootstrapInput {
  return {
    entitlement: {
      hasAccess: true,
      quotaTotal: 1,
      quotaRemaining: 1,
      planEndsAt: null,
      planLabel: null,
    },
    profile: null,
    reports: [],
    diagnosisSnapshot: null,
    goalStudent: null,
    activities: [],
    previousSurveyAnswers: null,
    nowIso: NOW_ISO,
    ...over,
  };
}

function reportRow(
  over: Partial<SurveyReportRow> & { id: string },
): SurveyReportRow {
  return {
    status: "draft",
    current_step: 0,
    track: null,
    step_state: {},
    survey_answers: null,
    activity_ids: [],
    grade_inputs: null,
    ledger_id: null,
    ledger_reversed_at: null,
    model_attempt_count: 0,
    last_activity_at: "2026-10-05T00:00:00.000Z",
    issued_at: null,
    created_at: "2026-10-04T00:00:00.000Z",
    ...over,
  };
}

describe("buildSurveyBootstrap", () => {
  test("미완 회차가 없으면 openReport 는 null 이고 프리필이 조립된다", () => {
    const { body, expiredIds } = buildSurveyBootstrap(
      bootstrapInput({
        diagnosisSnapshot: {
          goal: { level: "BOTH", targetMajor: "컴퓨터공학" },
        },
        goalStudent: { ideal_department: "컴퓨터공학", grade: "고2" },
        activities: [
          { subject: "수학", sources: null },
          { subject: "수학", sources: null },
        ],
        previousSurveyAnswers: { q1: "지난 회차 답" },
      }),
    );
    expect(expiredIds).toEqual([]);
    expect(body.ok).toBe(true);
    expect(body.questions).toBe(SURVEY_QUESTIONS);
    expect(body.openReport).toBeNull();
    expect(body.prefill.survey).toMatchObject({
      q5: "정해짐",
      q10: { name: "컴퓨터공학", source: "diagnosis" },
    });
    expect(body.profileInitial).toMatchObject({
      department: "컴퓨터공학",
      grade: "고2",
    });
    expect(body.prefill.autoFilled.favoriteSubjects).toEqual(["수학"]);
    expect(body.prefill.previousAnswers).toEqual({ q1: "지난 회차 답" });
  });

  test("프리필 재료가 없으면 비워서 돌려준다", () => {
    const { body } = buildSurveyBootstrap(bootstrapInput());
    expect(body.prefill.survey).toBeNull();
    expect(body.profileInitial).toBeNull();
    expect(body.prefill.previousAnswers).toBeNull();
    expect(body.profile).toBeNull();
    expect(body.promotion).toBeNull();
  });

  test("90일 안의 미완 회차는 답한 문항 수와 카드 문구를 담아 재사용한다", () => {
    const { body, expiredIds } = buildSurveyBootstrap(
      bootstrapInput({
        reports: [
          reportRow({
            id: REPORT_ID,
            survey_answers: { q1: "답", q2: "답", q3: "둘 다" },
          }),
        ],
        previousSurveyAnswers: { q1: "무시되어야 함" },
      }),
    );
    expect(expiredIds).toEqual([]);
    expect(body.openReport).toEqual({
      id: REPORT_ID,
      status: "draft",
      currentStep: 0,
      track: null,
      answered: 3,
      total: SURVEY_QUESTIONS.length,
      lastActivityAt: "2026-10-05T00:00:00.000Z",
      startedAt: "2026-10-04T00:00:00.000Z",
      resume: { resumeStep: 0, phase: "survey" },
      card: {
        startedAt: "2026-10-04T00:00:00.000Z",
        lastSavedAt: "2026-10-05T00:00:00.000Z",
        stepLabel: `2단계 학생 조사 ${SURVEY_QUESTIONS.length}문항 중 3문항 답함`,
      },
    });
    // 미완 회차가 있으면 이전 회차 답은 프리필에 쓰지 않는다.
    expect(body.prefill.previousAnswers).toBeNull();
  });

  test("90일이 지난 미완 회차는 만료 대상으로 돌려주고 openReport 는 없다", () => {
    const { body, expiredIds } = buildSurveyBootstrap(
      bootstrapInput({
        reports: [
          reportRow({
            id: REPORT_ID,
            last_activity_at: "2026-06-01T00:00:00.000Z",
          }),
        ],
        previousSurveyAnswers: { q1: "지난 답" },
      }),
    );
    expect(expiredIds).toEqual([REPORT_ID]);
    expect(body.openReport).toBeNull();
    expect(body.archivedCount).toBe(1);
    // 만료로 미완 회차가 사라졌으니 이전 답을 프리필로 쓸 수 있다.
    expect(body.prefill.previousAnswers).toEqual({ q1: "지난 답" });
  });

  test("완료 회차는 발급일 최신순으로 나열하고 보관 회차는 개수만 센다", () => {
    const { body } = buildSurveyBootstrap(
      bootstrapInput({
        reports: [
          reportRow({
            id: "a",
            status: "completed",
            track: "고1",
            issued_at: "2026-03-01T00:00:00.000Z",
          }),
          reportRow({
            id: "b",
            status: "completed",
            track: "고2",
            issued_at: "2026-09-01T00:00:00.000Z",
          }),
          reportRow({ id: "c", status: "archived" }),
        ],
      }),
    );
    expect(body.reports).toEqual([
      { id: "b", issuedAt: "2026-09-01T00:00:00.000Z", track: "고2" },
      { id: "a", issuedAt: "2026-03-01T00:00:00.000Z", track: "고1" },
    ]);
    expect(body.archivedCount).toBe(1);
    expect(body.openReport).toBeNull();
  });

  test("이전 학년도에 갱신된 고1 프로필은 고2 1학기 승급을 제안한다", () => {
    const { body } = buildSurveyBootstrap(
      bootstrapInput({
        profile: {
          grade: "고1",
          semester: 2,
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      }),
    );
    expect(body.promotion).toEqual({
      propose: true,
      next: { grade: 2, semester: 1 },
    });
  });

  test("학년이나 학기가 없거나 졸업, N수 이면 승급 판정을 하지 않는다", () => {
    const stale = "2026-02-01T00:00:00.000Z";
    for (const profile of [
      { grade: "고1", semester: null, updated_at: stale },
      { grade: null, semester: 1, updated_at: stale },
      { grade: "졸업", semester: 1, updated_at: stale },
      { grade: "N수", semester: 1, updated_at: stale },
    ]) {
      expect(
        buildSurveyBootstrap(bootstrapInput({ profile })).body.promotion,
      ).toBeNull();
    }
  });
});
