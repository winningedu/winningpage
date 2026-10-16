// api/growth/collect 가 쓰는 DB 조회와 갱신 보조. 핸들러에서 분리한 얇은 계층이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GROWTH_SETTING_KEYS,
  parseSufficiencyThresholds,
  readGrowthSetting,
} from "./appSettings.js";
import type { AggregateInput } from "./collectBody.js";
import {
  type ActivityRow,
  buildCollectSummary,
  type CollectUploadRow,
} from "./collectSummary.js";
import type { ExtractionParse } from "./extraction.js";
import {
  buildExtractOutcome,
  type ExtractOutcomeContext,
} from "./extractOutcome.js";
import { decideOpenReport, type GrowthReportRow } from "./reportSession.js";

export type Db = SupabaseClient;

const PG_UNIQUE_VIOLATION = "23505";

const REPORT_COLUMNS =
  "id, status, current_step, track, step_state, survey_answers, activity_ids, grade_inputs, ledger_id, ledger_reversed_at, model_attempt_count, last_activity_at, issued_at, created_at";

/** DB 오류를 던져 최상위 핸들러가 500 으로 처리하게 한다. */
export function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** 쓰기 직후 반환 행이 반드시 있어야 하는 호출용. 없으면 던진다. */
export function mustHave<T>(value: T, what: string): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${what}: 결과 없음`);
  return value as NonNullable<T>;
}

export async function loadUploads(db: Db, userId: string) {
  return must(
    await db
      .from("growth_uploads")
      .select("id, grade_label, semester, extraction_status, file_name")
      .eq("profile_id", userId),
    "growth_uploads 조회 실패",
  ) as CollectUploadRow[];
}

/** 집계 계산. 읽기만 한다. 설정이 없으면 GrowthSettingError 를 던진다. */
export async function computeSummary(
  db: Db,
  userId: string,
  body: AggregateInput,
) {
  const thresholds = await readGrowthSetting(
    async (key) =>
      must(
        await db
          .from("app_settings")
          .select("value")
          .eq("key", key)
          .maybeSingle(),
        "app_settings 조회 실패",
      ),
    GROWTH_SETTING_KEYS.sufficiencyThresholds,
    parseSufficiencyThresholds,
  );
  const rows = must(
    await db
      .from("activity_records")
      .select(
        "id, source_program, status, grade_label, semester, subject_group, subject, topic",
      )
      .eq("profile_id", userId),
    "activity_records 조회 실패",
  ) as (ActivityRow & { topic: string | null })[];
  const uploads = await loadUploads(db, userId);
  const profile = must(
    await db
      .from("student_profiles")
      .select("admission_year")
      .eq("profile_id", userId)
      .maybeSingle(),
    "student_profiles 조회 실패",
  );
  const goal = must(
    await db
      .from("goal_students")
      .select("naesin_scores")
      .eq("profile_id", userId)
      .maybeSingle(),
    "goal_students 조회 실패",
  );
  const summary = buildCollectSummary({
    track: body.track,
    current: body.current,
    rows,
    thresholds,
    profile: profile ?? null,
    naesinScores: goal?.naesin_scores ?? null,
    directGrades: body.directGrades,
    uploads,
  });
  return { summary, rows };
}

export type UploadClaim = {
  id: string;
  grade_label: "고1" | "고2" | "고3" | null;
  semester: 1 | 2 | null;
  file_name: string;
  mime_type: string;
};

/** pending 인 행만 processing 으로 선점한다. 선점하지 못하면 null. */
export async function claimUpload(db: Db, userId: string, uploadId: string) {
  const rows = must(
    await db
      .from("growth_uploads")
      .update({
        extraction_status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadId)
      .eq("profile_id", userId)
      .eq("extraction_status", "pending")
      .select("id, grade_label, semester, file_name, mime_type"),
    "growth_uploads 선점 실패",
  ) as UploadClaim[];
  return rows[0] ?? null;
}

/** processing 행만 갱신한다. 다른 요청이 먼저 끝냈으면 false. */
export async function updateProcessing(
  db: Db,
  userId: string,
  uploadId: string,
  patch: Record<string, unknown>,
) {
  const rows = must(
    await db
      .from("growth_uploads")
      .update(patch)
      .eq("id", uploadId)
      .eq("profile_id", userId)
      .eq("extraction_status", "processing")
      .select("id"),
    "growth_uploads 갱신 실패",
  ) as { id: string }[];
  return rows.length > 0;
}

/** 미완 회차 조회. 만료 회차는 재사용하지 않는다(만료 보관은 survey GET 과 크론 몫). */
export async function findOpenReportId(db: Db, userId: string) {
  const rows = must(
    await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("profile_id", userId)
      .in("status", ["draft", "in_progress"]),
    "growth_reports 조회 실패",
  ) as unknown as (Omit<GrowthReportRow, "issued_at"> & {
    issued_at: string | null;
    created_at: string;
  })[];
  const decision = decideOpenReport(
    rows.map((r) => ({ ...r, issued_at: r.issued_at ?? r.created_at })),
    new Date().toISOString(),
  );
  return decision.kind === "reuse" ? decision.report.id : null;
}

/** 추출 결과를 processing 행에 반영하고, 선점이 유지된 경우에만 활동을 만든다. */
export async function applyOutcome(
  db: Db,
  userId: string,
  ctx: ExtractOutcomeContext,
  parse: ExtractionParse,
) {
  const outcome = buildExtractOutcome(parse, ctx);
  const applied = await updateProcessing(
    db,
    userId,
    ctx.uploadId,
    outcome.uploadUpdate,
  );
  let activityId: string | undefined;
  if (applied && outcome.activityRow) {
    const { data, error } = await db
      .from("activity_records")
      .insert(outcome.activityRow)
      .select("id")
      .single();
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      throw new Error(`activity_records 등록 실패: ${error.message}`);
    }
    activityId = data?.id;
  }
  return { ...outcome.response, ...(activityId ? { activityId } : {}) };
}
