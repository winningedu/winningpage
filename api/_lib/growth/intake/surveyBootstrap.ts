// 성장설계 설문 엔드포인트의 순수 조립 함수(명세 No.118). DB 호출 없이 조회 결과만 받는다.

import {
  autoFilledFromActivities,
  type GoalStudentProfile,
  initialStudentProfileFromGoal,
  prefillSurveyFromDiagnosis,
  type SurveyPrefill,
} from "../prefill.js";
import { shouldProposePromotion } from "../session.js";
import { buildActivityOverview } from "./activityOverview.js";
import {
  type ActivityRow,
  filterMaterialActivities,
} from "./collectSummary.js";
import {
  decideOpenReport,
  deriveResumeStep,
  type GrowthReportRow,
  summarizeOpenReport,
} from "./reportSession.js";
import {
  countAnswered,
  SURVEY_QUESTIONS,
  type SurveyAnswers,
  type SurveyQuestion,
  validateSurveyPatch,
} from "./survey.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SurveyPostBody = {
  reportId: string | undefined;
  patch: SurveyAnswers;
};

/** POST 바디 형태 검증. 실패 사유는 INVALID_BODY 메시지로 쓴다. */
export function validateSurveyPostBody(
  raw: unknown,
): { ok: true; body: SurveyPostBody } | { ok: false; reason: string } {
  const b =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let reportId: string | undefined;
  if (b.reportId !== undefined) {
    if (typeof b.reportId !== "string" || !UUID_RE.test(b.reportId.trim())) {
      return { ok: false, reason: "reportId가 올바르지 않습니다." };
    }
    reportId = b.reportId.trim();
  }
  const patchResult = validateSurveyPatch(b.answers);
  if (!patchResult.ok) return { ok: false, reason: patchResult.reason };
  return { ok: true, body: { reportId, patch: patchResult.patch } };
}

export type SurveyEntitlement = {
  hasAccess: boolean;
  quotaTotal: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
};

/** growth_reports 조회 행. 회차 시작 시각(created_at)까지 담는다. */
export type SurveyReportRow = Omit<GrowthReportRow, "issued_at"> & {
  issued_at: string | null;
  created_at: string;
};

// 세션 규칙 함수는 issued_at 을 문자열로 가정한다. 미완 회차는 null 이라 시작 시각으로 채워 넘긴다.
function asSessionRow(row: SurveyReportRow): GrowthReportRow {
  return { ...row, issued_at: row.issued_at ?? row.created_at };
}

/** activity_records 조회 행. sources 는 자동 채움(도서명 추출)에 쓴다. */
export type SurveyActivityRow = ActivityRow & { sources: unknown };

export type SurveyBootstrapInput = {
  entitlement: SurveyEntitlement;
  /** student_profiles 행. 없으면 null. */
  profile: Record<string, unknown> | null;
  /** growth_reports 본인 행 전부. */
  reports: SurveyReportRow[];
  /** 최신 diagnosis_reports.snapshot. 없으면 null. */
  diagnosisSnapshot: unknown;
  /** goal_students 행. 없으면 null. */
  goalStudent: unknown;
  /** activity_records 본인 행 전부(planned 포함). 개요와 자동 채움은 여기서 planned 를 거른다. */
  activityRows: SurveyActivityRow[];
  /** app_settings 의 충분도 임계값. */
  thresholds: { enough: number };
  /** growth_profiles.survey_answers. 다음 회차 프리필 재료. */
  previousSurveyAnswers: unknown;
  nowIso: string;
};

export type SurveyOpenReport = {
  id: string;
  status: "draft" | "in_progress";
  currentStep: number;
  track: string | null;
  answered: number;
  total: number;
  /** 저장된 설문 답 본문. 학생 조사 화면 복원용. */
  answers: Record<string, unknown>;
  lastActivityAt: string;
  startedAt: string;
  resume: ReturnType<typeof deriveResumeStep>;
  card: ReturnType<typeof summarizeOpenReport>;
};

export type SurveyBootstrapBody = {
  ok: true;
  questions: readonly SurveyQuestion[];
  entitlement: SurveyEntitlement;
  profile: Record<string, unknown> | null;
  profileInitial: GoalStudentProfile | null;
  openReport: SurveyOpenReport | null;
  activityOverview: ReturnType<typeof buildActivityOverview>;
  reports: { id: string; issuedAt: string; track: string | null }[];
  archivedCount: number;
  prefill: {
    survey: SurveyPrefill | null;
    autoFilled: ReturnType<typeof autoFilledFromActivities>;
    previousAnswers: unknown;
  };
  promotion: ReturnType<typeof shouldProposePromotion> | null;
};

function nonEmptyObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return Object.keys(v).length > 0 ? (v as Record<string, unknown>) : null;
}

const GRADE_NUMBER = { 고1: 1, 고2: 2, 고3: 3 } as const;

// 학년(고1~고3)과 학기가 모두 있을 때만 판정한다. 값을 지어내지 않는다.
function promotionOf(profile: Record<string, unknown> | null, nowIso: string) {
  if (!profile) return null;
  const { grade, semester, updated_at: updatedAt } = profile;
  if (typeof grade !== "string" || !Object.hasOwn(GRADE_NUMBER, grade))
    return null;
  if (semester !== 1 && semester !== 2) return null;
  if (typeof updatedAt !== "string") return null;
  return shouldProposePromotion(
    {
      grade: GRADE_NUMBER[grade as keyof typeof GRADE_NUMBER],
      semester,
      updatedAt,
    },
    nowIso,
  );
}

function summarizeOpen(row: SurveyReportRow): SurveyOpenReport {
  const { answered, total } = countAnswered(row.survey_answers);
  // 미완 회차의 issued_at 은 null 이라 시작 시각은 created_at 으로 대체한다.
  const card = {
    ...summarizeOpenReport(asSessionRow(row), answered, total),
    startedAt: row.created_at,
  };
  return {
    id: row.id,
    status: row.status as "draft" | "in_progress",
    currentStep: row.current_step,
    track: row.track,
    answered,
    total,
    answers: nonEmptyObject(row.survey_answers) ?? {},
    lastActivityAt: row.last_activity_at,
    startedAt: row.created_at,
    resume: deriveResumeStep(asSessionRow(row)),
    card,
  };
}

/** 미완 회차 판정. GET 과 POST 가 같은 규칙(decideOpenReport)을 쓰도록 한곳에 둔다. */
export function pickOpenReport(
  reports: SurveyReportRow[],
  nowIso: string,
): { open: SurveyReportRow | null; expiredIds: string[] } {
  const decision = decideOpenReport(reports.map(asSessionRow), nowIso);
  if (decision.kind === "reuse") {
    const open = reports.find((r) => r.id === decision.report.id);
    return { open: open ?? null, expiredIds: [] };
  }
  return {
    open: null,
    expiredIds:
      decision.kind === "expire_and_create" ? decision.expiredIds : [],
  };
}

/** GET 응답 조립. DB 호출 없이 조회 결과만 받는다. expiredIds 는 핸들러가 archived 로 바꾼다. */
export function buildSurveyBootstrap(input: SurveyBootstrapInput): {
  body: SurveyBootstrapBody;
  expiredIds: string[];
} {
  const { open, expiredIds } = pickOpenReport(input.reports, input.nowIso);
  const material = filterMaterialActivities(input.activityRows);
  const body: SurveyBootstrapBody = {
    ok: true,
    questions: SURVEY_QUESTIONS,
    entitlement: input.entitlement,
    profile: input.profile,
    profileInitial: input.goalStudent
      ? initialStudentProfileFromGoal(input.goalStudent)
      : null,
    openReport: open ? summarizeOpen(open) : null,
    activityOverview: buildActivityOverview({
      rows: input.activityRows,
      thresholds: input.thresholds,
    }),
    reports: input.reports
      .flatMap((r) =>
        r.status === "completed" && r.issued_at !== null
          ? [{ id: r.id, issuedAt: r.issued_at, track: r.track }]
          : [],
      )
      .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt)),
    archivedCount:
      input.reports.filter((r) => r.status === "archived").length +
      expiredIds.length,
    prefill: {
      survey: input.diagnosisSnapshot
        ? prefillSurveyFromDiagnosis(input.diagnosisSnapshot)
        : null,
      autoFilled: autoFilledFromActivities(material),
      previousAnswers: open
        ? null
        : nonEmptyObject(input.previousSurveyAnswers),
    },
    promotion: promotionOf(input.profile, input.nowIso),
  };
  return { body, expiredIds };
}

/** 새 회차 insert 용. null 은 "비움" 이라 저장할 키에서 뺀다(update 는 RPC 가 처리). */
export function stripNullKeys(patch: SurveyAnswers): SurveyAnswers {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== null),
  );
}

export const REPORT_LOCKED_MESSAGE =
  "리포트 생성이 시작된 회차는 설문을 바꿀 수 없어요.";

/** 재사용 대상 회차에 설문을 쓸 수 있는지 판정한다. 4단계 시작(current_step>0) 뒤에는 잠근다. */
export function assertReportWritable(row: {
  current_step: number;
}): { ok: true } | { ok: false; code: "REPORT_LOCKED"; message: string } {
  if (row.current_step > 0) {
    return { ok: false, code: "REPORT_LOCKED", message: REPORT_LOCKED_MESSAGE };
  }
  return { ok: true };
}
