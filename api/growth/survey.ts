// GET/POST /api/growth/survey
// Authorization: Bearer <access_token>
//
// 성장설계 설문 엔드포인트(명세 No.118).
//   GET  시작 화면과 학생 조사 화면에 필요한 데이터를 한 번에 돌려준다.
//   POST 문항별 자동 저장(No.28, No.144). 미완 회차가 없으면 첫 저장 때 만든다.
//
// 핸들러 본문은 DB 에 묶여 있어 단위 테스트하지 않는다. 조립 규칙은 이 파일에서
// export 한 순수 함수(validateSurveyPostBody, buildSurveyBootstrap, nextSurveyWrite)로 검증한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { fetchStudentRow } from "../_lib/goalRepo.js";
import {
  decideOpenReport,
  deriveResumeStep,
  type GrowthReportRow,
  summarizeOpenReport,
} from "../_lib/growth/intake/reportSession.js";
import {
  countAnswered,
  mergeSurveyAnswers,
  SURVEY_QUESTIONS,
  type SurveyAnswers,
  type SurveyQuestion,
  validateSurveyPatch,
} from "../_lib/growth/intake/survey.js";
import {
  autoFilledFromActivities,
  type GoalStudentProfile,
  initialStudentProfileFromGoal,
  prefillSurveyFromDiagnosis,
  type SurveyPrefill,
} from "../_lib/growth/prefill.js";
import { shouldProposePromotion } from "../_lib/growth/session.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

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

export type SurveyInsertRow = {
  status: "draft";
  current_step: 0;
  survey_answers: SurveyAnswers;
  last_activity_at: string;
};

export type SurveyUpdateRow = {
  survey_answers: SurveyAnswers;
  last_activity_at: string;
  updated_at: string;
};

export type SurveyWrite =
  | { kind: "insert"; row: SurveyInsertRow }
  | { kind: "update"; id: string; row: SurveyUpdateRow };

/** 문항별 저장이 만들 쓰기 동작을 정한다. 미완 회차가 없으면 insert, 있으면 병합 update. */
export function nextSurveyWrite(input: {
  openRow: { id: string; survey_answers: unknown } | null;
  patch: SurveyAnswers;
  nowIso: string;
}): SurveyWrite {
  const { openRow, patch, nowIso } = input;
  if (!openRow) {
    return {
      kind: "insert",
      row: {
        status: "draft",
        current_step: 0,
        survey_answers: mergeSurveyAnswers({}, patch),
        last_activity_at: nowIso,
      },
    };
  }
  return {
    kind: "update",
    id: openRow.id,
    row: {
      survey_answers: mergeSurveyAnswers(openRow.survey_answers, patch),
      last_activity_at: nowIso,
      updated_at: nowIso,
    },
  };
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
  /** activity_records 중 planned 가 아닌 본인 행. */
  activities: { subject?: string | null; sources?: unknown }[];
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
    lastActivityAt: row.last_activity_at,
    startedAt: row.created_at,
    resume: deriveResumeStep(asSessionRow(row)),
    card,
  };
}

/** GET 응답 조립. DB 호출 없이 조회 결과만 받는다. expiredIds 는 핸들러가 archived 로 바꾼다. */
export function buildSurveyBootstrap(input: SurveyBootstrapInput): {
  body: SurveyBootstrapBody;
  expiredIds: string[];
} {
  const decision = decideOpenReport(
    input.reports.map(asSessionRow),
    input.nowIso,
  );
  const open =
    decision.kind === "reuse"
      ? input.reports.find((r) => r.id === decision.report.id)
      : undefined;
  const expiredIds =
    decision.kind === "expire_and_create" ? decision.expiredIds : [];
  const body: SurveyBootstrapBody = {
    ok: true,
    questions: SURVEY_QUESTIONS,
    entitlement: input.entitlement,
    profile: input.profile,
    profileInitial: input.goalStudent
      ? initialStudentProfileFromGoal(input.goalStudent)
      : null,
    openReport: open ? summarizeOpen(open) : null,
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
      autoFilled: autoFilledFromActivities(input.activities),
      previousAnswers: open
        ? null
        : nonEmptyObject(input.previousSurveyAnswers),
    },
    promotion: promotionOf(input.profile, input.nowIso),
  };
  return { body, expiredIds };
}

const REPORT_COLUMNS =
  "id,status,current_step,track,step_state,survey_answers,activity_ids,grade_inputs,ledger_id,ledger_reversed_at,model_attempt_count,issued_at,last_activity_at,created_at";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  sendError(res, "coded", status, message, code, { ok: false });
}

async function readEntitlement(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<SurveyEntitlement> {
  const config = SERVICE_CONFIGS.growth;
  if (!config) throw new Error("SERVICE_CONFIGS.growth 가 없습니다.");
  const { allowed } = await hasPaidServiceAccess(supabaseAdmin, userId, config);
  // 회차 정보는 안내용이라 못 읽어도 진입을 막지 않는다(performance/bootstrap 과 같은 취급).
  let quota = await readQuotaSnapshot(supabaseAdmin, userId, null);
  try {
    quota = await readQuotaSnapshot(
      supabaseAdmin,
      userId,
      await findProgramAccessRow(supabaseAdmin, userId, config),
    );
  } catch (quotaError) {
    console.error("growth/survey quota 조회 실패(무시):", quotaError);
  }
  return {
    hasAccess: allowed,
    quotaTotal: quota.quotaTotal,
    quotaRemaining: quota.quotaRemaining,
    planEndsAt: quota.planEndsAt,
    planLabel: quota.planLabel,
  };
}

async function handleGet(
  res: VercelResponse,
  supabaseAdmin: SupabaseClient,
  userId: string,
) {
  const nowIso = new Date().toISOString();
  const entitlement = await readEntitlement(supabaseAdmin, userId);

  const [profileRes, reportsRes, diagnosisRes, activitiesRes, growthRes] =
    await Promise.all([
      supabaseAdmin
        .from("student_profiles")
        .select("*")
        .eq("profile_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("growth_reports")
        .select(REPORT_COLUMNS)
        .eq("profile_id", userId)
        .order("last_activity_at", { ascending: false }),
      supabaseAdmin
        .from("diagnosis_reports")
        .select("snapshot")
        .eq("profile_id", userId)
        .order("diagnosed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("activity_records")
        .select("subject,sources")
        .eq("profile_id", userId)
        .neq("status", "planned"),
      supabaseAdmin
        .from("growth_profiles")
        .select("survey_answers")
        .eq("profile_id", userId)
        .maybeSingle(),
    ]);
  for (const r of [
    profileRes,
    reportsRes,
    diagnosisRes,
    activitiesRes,
    growthRes,
  ]) {
    if (r.error) throw r.error;
  }
  const goalStudent = await fetchStudentRow(supabaseAdmin, userId);

  const { body, expiredIds } = buildSurveyBootstrap({
    entitlement,
    profile: profileRes.data,
    reports: (reportsRes.data ?? []) as SurveyReportRow[],
    diagnosisSnapshot: diagnosisRes.data?.snapshot ?? null,
    goalStudent,
    activities: activitiesRes.data ?? [],
    previousSurveyAnswers: growthRes.data?.survey_answers ?? null,
    nowIso,
  });

  // 만료된 미완 회차는 보관 처리해 학생당 미완 1개 제약을 풀어 둔다.
  if (expiredIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("growth_reports")
      .update({ status: "archived", updated_at: nowIso })
      .eq("profile_id", userId)
      .in("id", expiredIds);
    if (error) throw error;
  }

  res.status(200).json(body);
}

async function findOpenRow(supabaseAdmin: SupabaseClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("growth_reports")
    .select("id,survey_answers")
    .eq("profile_id", userId)
    .in("status", ["draft", "in_progress"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function handlePost(
  req: { body: unknown },
  res: VercelResponse,
  supabaseAdmin: SupabaseClient,
  userId: string,
) {
  const validated = validateSurveyPostBody(req.body);
  if (!validated.ok) {
    fail(res, 400, "INVALID_BODY", validated.reason);
    return;
  }
  const { reportId, patch } = validated.body;
  const nowIso = new Date().toISOString();

  let openRow = await findOpenRow(supabaseAdmin, userId);
  if (reportId && openRow?.id !== reportId) {
    fail(
      res,
      409,
      "REPORT_NOT_OPEN",
      "이미 닫힌 회차예요. 처음부터 다시 시작해 주세요.",
    );
    return;
  }

  // 새 회차는 이용권이 있어야 만든다. 차감은 여기서 하지 않는다(4단계 생성 성공 시 차감).
  if (!openRow) {
    const entitlement = await readEntitlement(supabaseAdmin, userId);
    if (!entitlement.hasAccess || entitlement.quotaRemaining === 0) {
      fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 성장설계는 이용권 1회로 리포트 하나를 만들어요.",
      );
      return;
    }
  }

  let write = nextSurveyWrite({ openRow, patch, nowIso });
  let savedId: string;
  let savedAnswers: SurveyAnswers;

  if (write.kind === "insert") {
    const { data, error } = await supabaseAdmin
      .from("growth_reports")
      .insert({ profile_id: userId, ...write.row })
      .select("id,survey_answers")
      .single();
    if (error?.code === "23505") {
      // 동시 요청이 먼저 만들었다. 다시 조회해 그 행에 병합한다.
      openRow = await findOpenRow(supabaseAdmin, userId);
      if (!openRow) throw error;
      write = nextSurveyWrite({ openRow, patch, nowIso });
    } else if (error) {
      throw error;
    } else {
      savedId = data.id;
      savedAnswers = data.survey_answers as SurveyAnswers;
      res.status(200).json(saved(savedId, savedAnswers, nowIso));
      return;
    }
  }

  if (write.kind !== "update") throw new Error("growth/survey 쓰기 상태 오류");
  const { error } = await supabaseAdmin
    .from("growth_reports")
    .update(write.row)
    .eq("id", write.id)
    .eq("profile_id", userId);
  if (error) throw error;
  res.status(200).json(saved(write.id, write.row.survey_answers, nowIso));
}

function saved(reportId: string, answers: SurveyAnswers, savedAt: string) {
  const { answered, total } = countAnswered(answers);
  return { ok: true, reportId, answered, total, savedAt };
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET, POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "성장설계 설문 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/survey",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    if (req.method === "GET") {
      await handleGet(res, ctx.supabaseAdmin, userId);
      return;
    }
    await handlePost(req, res, ctx.supabaseAdmin, userId);
  },
});

export const config = { runtime: "nodejs" };
