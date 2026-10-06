// 성장설계 설문 엔드포인트의 순수 조립 함수 테스트. 핸들러 본문은 DB 에 묶여 있어 다루지 않는다.
import { describe, expect, test } from "vitest";
import { SURVEY_QUESTIONS } from "./survey.js";
import {
  assertReportWritable,
  buildSurveyBootstrap,
  pickOpenReport,
  type SurveyActivityRow,
  type SurveyBootstrapInput,
  type SurveyReportRow,
  stripNullKeys,
  validateSurveyPostBody,
} from "./surveyBootstrap.js";

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
    activityRows: [],
    thresholds: { enough: 5 },
    previousSurveyAnswers: null,
    nowIso: NOW_ISO,
    ...over,
  };
}

function activityRow(
  over: Partial<SurveyActivityRow> & { id: string },
): SurveyActivityRow {
  return {
    source_program: "manual",
    status: "confirmed",
    grade_label: "고2",
    semester: 1,
    subject_group: "국어",
    subject: "국어",
    sources: null,
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
        activityRows: [
          activityRow({ id: "a1", subject: "수학" }),
          activityRow({ id: "a2", subject: "수학" }),
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
      answers: { q1: "답", q2: "답", q3: "둘 다" },
      lastActivityAt: "2026-10-05T00:00:00.000Z",
      startedAt: "2026-10-04T00:00:00.000Z",
      resume: { resumeStep: 0, phase: "survey" },
      card: {
        startedAt: "2026-10-04T00:00:00.000Z",
        lastSavedAt: "2026-10-05T00:00:00.000Z",
        stepLabel: `2단계 학생 조사 ${SURVEY_QUESTIONS.length}문항 중 3문항 답함`,
      },
    });
    // 학생 조사 화면 복원용으로 저장된 답 본문을 그대로 담는다(No.144).
    expect(body.openReport?.answers).toEqual({
      q1: "답",
      q2: "답",
      q3: "둘 다",
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

describe("buildSurveyBootstrap 시작 화면 카드 값", () => {
  test("저장 활동 개요가 건수, 교과 창체 구분, 1학년 충분도를 담는다", () => {
    const { body } = buildSurveyBootstrap(
      bootstrapInput({
        activityRows: [
          activityRow({ id: "f1", grade_label: "고1", semester: 1 }),
          activityRow({ id: "f2", grade_label: "고1", semester: 2 }),
          activityRow({ id: "c1", source_program: "upload" }),
          activityRow({ id: "e1", subject_group: "창체" }),
          activityRow({ id: "p1", status: "planned" }),
        ],
        thresholds: { enough: 3 },
      }),
    );
    expect(body.activityOverview.total).toBe(4);
    expect(body.activityOverview.bySource).toMatchObject({
      manual: 3,
      upload: 1,
      total: 4,
    });
    expect(body.activityOverview.byGroup).toEqual({
      curricular: 3,
      extracurricular: 1,
      unclassified: 0,
    });
    expect(body.activityOverview.firstYear).toMatchObject({ count: 2 });
  });

  test("planned 활동은 자동 채움에서도 빠진다", () => {
    const { body } = buildSurveyBootstrap(
      bootstrapInput({
        activityRows: [
          activityRow({ id: "a", subject: "수학" }),
          activityRow({ id: "a2", subject: "수학" }),
          activityRow({ id: "b", subject: "과학", status: "planned" }),
          activityRow({ id: "b2", subject: "과학", status: "planned" }),
          activityRow({ id: "b3", subject: "과학", status: "planned" }),
        ],
      }),
    );
    expect(body.prefill.autoFilled.favoriteSubjects).toEqual(["수학"]);
  });

  test("이용권, 지난 리포트, 승급 제안이 한 응답에 함께 들어간다", () => {
    const { body } = buildSurveyBootstrap(
      bootstrapInput({
        reports: [
          reportRow({
            id: "done",
            status: "completed",
            track: "고2",
            issued_at: "2026-09-01T00:00:00.000Z",
          }),
        ],
        profile: {
          grade: "고1",
          semester: 2,
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      }),
    );
    expect(body.entitlement.quotaRemaining).toBe(1);
    expect(body.reports).toHaveLength(1);
    expect(body.promotion).toMatchObject({ propose: true });
  });
});

describe("stripNullKeys", () => {
  test("null 값 키를 뺀 새 객체를 돌려주고 입력은 바꾸지 않는다", () => {
    const patch = { q1: "답", q2: null, q3: ["a"] };
    expect(stripNullKeys(patch)).toEqual({ q1: "답", q3: ["a"] });
    expect(patch).toHaveProperty("q2", null);
  });
});

describe("assertReportWritable", () => {
  test("current_step 이 0 이면 쓸 수 있다", () => {
    expect(assertReportWritable({ current_step: 0 })).toEqual({ ok: true });
  });

  test("리포트 생성이 시작된 회차는 REPORT_LOCKED 로 막는다", () => {
    expect(assertReportWritable({ current_step: 1 })).toEqual({
      ok: false,
      code: "REPORT_LOCKED",
      message: "리포트 생성이 시작된 회차는 설문을 바꿀 수 없어요.",
    });
  });
});

describe("pickOpenReport", () => {
  test("90일 안의 미완 회차는 재사용 대상으로 돌려준다", () => {
    const row = reportRow({ id: REPORT_ID });
    expect(pickOpenReport([row], NOW_ISO)).toEqual({
      open: row,
      expiredIds: [],
    });
  });

  test("90일이 지난 미완 회차는 부활시키지 않고 만료 대상으로 돌려준다", () => {
    const stale = reportRow({
      id: REPORT_ID,
      last_activity_at: "2026-06-01T00:00:00.000Z",
    });
    expect(pickOpenReport([stale], NOW_ISO)).toEqual({
      open: null,
      expiredIds: [REPORT_ID],
    });
  });

  test("미완 회차가 없으면 아무것도 돌려주지 않는다", () => {
    expect(
      pickOpenReport([reportRow({ id: "a", status: "completed" })], NOW_ISO),
    ).toEqual({ open: null, expiredIds: [] });
  });
});
