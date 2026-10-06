// GET/POST /api/growth/survey
// Authorization: Bearer <access_token>
//
// 성장설계 설문 엔드포인트(명세 No.118).
//   GET  시작 화면과 학생 조사 화면에 필요한 데이터를 한 번에 돌려준다.
//   POST 문항별 자동 저장(No.28, No.144). 미완 회차가 없으면 첫 저장 때 만든다.
//
// 계약:
//   - 직접 입력 활동은 클라이언트가 activity_records 에 RLS 로 직접 쓰고,
//     student_profiles 초기값(profileInitial)도 클라이언트가 저장한다.
//   - 클라이언트는 설문 저장을 직렬화하지 않아도 된다(RPC 가 답을 원자 병합한다).
//   - current_step 이 0 보다 큰 회차는 REPORT_LOCKED(409)로 막는다.
//
// 핸들러 본문은 DB 에 묶여 있어 단위 테스트하지 않는다. 조립 규칙은
// api/_lib/growth/intake/surveyBootstrap.ts 의 순수 함수로 검증한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { fetchStudentRow } from "../_lib/goalRepo.js";
import {
  GROWTH_SETTING_KEYS,
  GrowthSettingError,
  parseSufficiencyThresholds,
  readGrowthSetting,
} from "../_lib/growth/intake/appSettings.js";
import {
  countAnswered,
  type SurveyAnswers,
} from "../_lib/growth/intake/survey.js";
import {
  assertReportWritable,
  buildSurveyBootstrap,
  pickOpenReport,
  REPORT_LOCKED_MESSAGE,
  type SurveyActivityRow,
  type SurveyEntitlement,
  type SurveyReportRow,
  stripNullKeys,
  validateSurveyPostBody,
} from "../_lib/growth/intake/surveyBootstrap.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

const REPORT_COLUMNS =
  "id,status,current_step,track,step_state,survey_answers,activity_ids,grade_inputs,ledger_id,ledger_reversed_at,model_attempt_count,issued_at,last_activity_at,created_at";

const ACTIVITY_COLUMNS =
  "id,source_program,status,grade_label,semester,subject_group,subject,sources";

type Db = SupabaseClient;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  sendError(res, "coded", status, message, code, { ok: false });
}

async function readEntitlement(
  supabaseAdmin: Db,
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

function readThresholds(db: Db) {
  return readGrowthSetting(
    async (key) => {
      const { data, error } = await db
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    GROWTH_SETTING_KEYS.sufficiencyThresholds,
    parseSufficiencyThresholds,
  );
}

/** 만료된 미완 회차는 보관 처리해 학생당 미완 1개 제약을 풀어 둔다. */
async function archiveExpired(
  db: Db,
  userId: string,
  expiredIds: string[],
  nowIso: string,
) {
  if (expiredIds.length === 0) return;
  const { error } = await db
    .from("growth_reports")
    .update({ status: "archived", updated_at: nowIso })
    .eq("profile_id", userId)
    .in("id", expiredIds);
  if (error) throw error;
}

async function handleGet(res: VercelResponse, db: Db, userId: string) {
  const nowIso = new Date().toISOString();
  let thresholds: { enough: number };
  try {
    thresholds = await readThresholds(db);
  } catch (e) {
    if (e instanceof GrowthSettingError) {
      console.error("growth/survey 설정 오류:", e);
      fail(res, 500, "SETTING_MISSING", "성장설계 설정을 읽지 못했습니다.");
      return;
    }
    throw e;
  }
  const entitlement = await readEntitlement(db, userId);

  const [profileRes, reportsRes, diagnosisRes, activitiesRes, growthRes] =
    await Promise.all([
      db
        .from("student_profiles")
        .select("*")
        .eq("profile_id", userId)
        .maybeSingle(),
      db
        .from("growth_reports")
        .select(REPORT_COLUMNS)
        .eq("profile_id", userId)
        .order("last_activity_at", { ascending: false }),
      db
        .from("diagnosis_reports")
        .select("snapshot")
        .eq("profile_id", userId)
        .order("diagnosed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("activity_records")
        .select(ACTIVITY_COLUMNS)
        .eq("profile_id", userId),
      db
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
  const goalStudent = await fetchStudentRow(db, userId);

  const { body, expiredIds } = buildSurveyBootstrap({
    entitlement,
    profile: profileRes.data,
    reports: (reportsRes.data ?? []) as SurveyReportRow[],
    diagnosisSnapshot: diagnosisRes.data?.snapshot ?? null,
    goalStudent,
    activityRows: (activitiesRes.data ?? []) as SurveyActivityRow[],
    thresholds,
    previousSurveyAnswers: growthRes.data?.survey_answers ?? null,
    nowIso,
  });
  await archiveExpired(db, userId, expiredIds, nowIso);
  res.status(200).json(body);
}

/** 미완 행 조회. GET 과 같은 규칙(pickOpenReport)으로 재사용 대상을 고른다. */
async function loadOpenReport(db: Db, userId: string, nowIso: string) {
  const { data, error } = await db
    .from("growth_reports")
    .select(REPORT_COLUMNS)
    .eq("profile_id", userId)
    .in("status", ["draft", "in_progress"]);
  if (error) throw error;
  return pickOpenReport((data ?? []) as SurveyReportRow[], nowIso);
}

function saved(reportId: string, answers: unknown, savedAt: string) {
  const { answered, total } = countAnswered(answers);
  return { ok: true, reportId, answered, total, savedAt };
}

/** 잠금 가드를 통과한 회차에 RPC 로 답을 원자 병합하고 응답한다. */
async function mergeAndRespond(
  res: VercelResponse,
  db: Db,
  userId: string,
  open: SurveyReportRow,
  patch: SurveyAnswers,
  nowIso: string,
) {
  const guard = assertReportWritable(open);
  if (!guard.ok) {
    fail(res, 409, guard.code, guard.message);
    return;
  }
  // null 값(문항 비우기)은 RPC 가 jsonb_strip_nulls 로 지운다.
  const { data, error } = await db.rpc("fn_growth_merge_survey_answers", {
    p_report_id: open.id,
    p_profile_id: userId,
    p_patch: patch,
  });
  if (error) throw error;
  if (data === null) {
    // 가드 불일치(그 사이 생성이 시작됐거나 닫힘).
    fail(res, 409, "REPORT_LOCKED", REPORT_LOCKED_MESSAGE);
    return;
  }
  res.status(200).json(saved(open.id, data, nowIso));
}

async function handlePost(
  req: { body: unknown },
  res: VercelResponse,
  db: Db,
  userId: string,
) {
  const validated = validateSurveyPostBody(req.body);
  if (!validated.ok) {
    fail(res, 400, "INVALID_BODY", validated.reason);
    return;
  }
  const { reportId, patch } = validated.body;
  const nowIso = new Date().toISOString();

  const { open, expiredIds } = await loadOpenReport(db, userId, nowIso);
  await archiveExpired(db, userId, expiredIds, nowIso);

  if (reportId && open?.id !== reportId) {
    fail(
      res,
      409,
      "REPORT_NOT_OPEN",
      "이미 닫힌 회차예요. 처음부터 다시 시작해 주세요.",
    );
    return;
  }
  if (open) {
    await mergeAndRespond(res, db, userId, open, patch, nowIso);
    return;
  }

  // 새 회차는 이용권이 있어야 만든다. 차감은 여기서 하지 않는다(4단계 생성 성공 시 차감).
  const entitlement = await readEntitlement(db, userId);
  if (!entitlement.hasAccess || entitlement.quotaRemaining === 0) {
    fail(
      res,
      403,
      "NO_ENTITLEMENT",
      "이용권이 없어요. 성장설계는 이용권 1회로 리포트 하나를 만들어요.",
    );
    return;
  }

  const { data, error } = await db
    .from("growth_reports")
    .insert({
      profile_id: userId,
      status: "draft",
      current_step: 0,
      survey_answers: stripNullKeys(patch),
      last_activity_at: nowIso,
    })
    .select("id,survey_answers")
    .single();
  if (error?.code === "23505") {
    // 동시 요청이 먼저 만들었다. 다시 조회해 그 행에 RPC 로 병합한다.
    const raced = await loadOpenReport(db, userId, nowIso);
    if (!raced.open) throw error;
    await mergeAndRespond(res, db, userId, raced.open, patch, nowIso);
    return;
  }
  if (error) throw error;
  res.status(200).json(saved(data.id, data.survey_answers, nowIso));
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
