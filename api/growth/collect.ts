// POST /api/growth/collect
// Authorization: Bearer <access_token>
//
// 성장설계 자료 수집 엔드포인트(명세 No.118). action 으로 세 갈래를 나눈다.
//   summary    활동 집계와 성적 입력 정리(No.37~51, No.113)
//   upload-url 업로드 메타 등록과 서명 업로드 URL 발급(No.42, No.122)
//   extract    업로드 파일에서 네 항목 추출(No.43, No.145)
//
// 핸들러 본문은 DB, Storage, Gemini 에 묶여 있어 단위 테스트하지 않는다. 검증, 경로 생성,
// 추출 모드 결정, 결과 조립은 이 파일에서 export 한 순수 함수로 검증한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { callText, callVision } from "../_lib/gemini.js";
import {
  GROWTH_SETTING_KEYS,
  GrowthSettingError,
  parseSufficiencyThresholds,
  readGrowthSetting,
} from "../_lib/growth/intake/appSettings.js";
import {
  type ActivityRow,
  buildCollectSummary,
  filterMaterialActivities,
  type UploadRow,
  uploadQuotaLeft,
} from "../_lib/growth/intake/collectSummary.js";
import {
  ALLOWED_UPLOAD_MIME,
  buildExtractionPrompt,
  EXTRACTION_RESPONSE_SCHEMA,
  type Extracted,
  type ExtractionParse,
  parseExtractionResponse,
  textFromUpload,
  toActivityRecordFromExtraction,
  type UploadRequest,
  type UploadText,
  validateUploadRequest,
} from "../_lib/growth/intake/extraction.js";
import type { SemesterKey, Track } from "../_lib/growth/types.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

const TRACKS: readonly Track[] = ["고1", "고2", "고3", "졸업", "N수"];

export type SummaryBody = {
  action: "summary";
  track: Track;
  directGrades: Partial<Record<SemesterKey, number | null>> | null;
  current: { grade: 1 | 2 | 3; semester: 1 | 2 } | undefined;
};

export type UploadUrlBody = {
  action: "upload-url";
  upload: UploadRequest & { ext: string };
};

export type ExtractBody = { action: "extract"; uploadId: string };

export type CollectBody = SummaryBody | UploadUrlBody | ExtractBody;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CollectValidation =
  | { ok: true; body: CollectBody }
  | { ok: false; status: number; code: string; reason: string };

const SEMESTER_KEYS: readonly SemesterKey[] = [
  "고1-1",
  "고1-2",
  "고2-1",
  "고2-2",
  "고3-1",
  "고3-2",
];

function parseDirectGrades(
  v: unknown,
): { ok: true; value: SummaryBody["directGrades"] } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false };
  const out: Partial<Record<SemesterKey, number | null>> = {};
  for (const [k, val] of Object.entries(v)) {
    const key = SEMESTER_KEYS.find((s) => s === k);
    if (!key) return { ok: false };
    if (val === null) {
      out[key] = null;
    } else if (typeof val === "number" && val >= 1 && val <= 9) {
      out[key] = val;
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: out };
}

function parseCurrent(
  v: unknown,
): { ok: true; value: SummaryBody["current"] } | { ok: false } {
  if (v === undefined) return { ok: true, value: undefined };
  const c = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!c) return { ok: false };
  const { grade, semester } = c;
  if (
    (grade !== 1 && grade !== 2 && grade !== 3) ||
    (semester !== 1 && semester !== 2)
  ) {
    return { ok: false };
  }
  return { ok: true, value: { grade, semester } };
}

const invalid = (reason: string): CollectValidation => ({
  ok: false,
  status: 400,
  code: "INVALID_BODY",
  reason,
});

function validateSummary(b: Record<string, unknown>): CollectValidation {
  const track = TRACKS.find((t) => t === b.track);
  if (!track) return invalid("track 오류");
  const direct = parseDirectGrades(b.directGrades);
  if (!direct.ok) return invalid("directGrades 오류");
  const current = parseCurrent(b.current);
  if (!current.ok) return invalid("current 오류");
  return {
    ok: true,
    body: {
      action: "summary",
      track,
      directGrades: direct.value,
      current: current.value,
    },
  };
}

export function validateCollectBody(raw: unknown): CollectValidation {
  const b =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.action === "summary") return validateSummary(b);
  if (b.action === "upload-url") {
    const v = validateUploadRequest(b);
    if (!v.ok) {
      const status =
        v.code === "UNSUPPORTED_MIME"
          ? 415
          : v.code === "FILE_TOO_LARGE"
            ? 413
            : 400;
      return { ok: false, status, code: v.code, reason: v.reason };
    }
    return { ok: true, body: { action: "upload-url", upload: v.value } };
  }
  if (b.action === "extract") {
    const uploadId = typeof b.uploadId === "string" ? b.uploadId.trim() : "";
    if (!UUID_RE.test(uploadId)) return invalid("uploadId 오류");
    return { ok: true, body: { action: "extract", uploadId } };
  }
  return invalid("action 오류");
}

/**
 * 스토리지 객체 경로. DB 에 저장하지 않고 이 함수로 매번 재생성한다.
 * 저장 경로 컬럼이 없어야 원문 미보관 원칙이 스키마에서도 지켜진다.
 */
export function uploadObjectPath(
  userId: string,
  reportId: string,
  uploadId: string,
  ext: string,
): string {
  return `${userId}/${reportId}/${uploadId}.${ext}`;
}

/** 업로드 내용 종류에 따라 모델 호출 방식을 정한다. */
export function decideExtractionMode(
  uploadText: UploadText,
): "text" | "vision" | "unsupported" {
  if (uploadText.kind === "text") return "text";
  if (uploadText.kind === "binary") return "vision";
  return "unsupported";
}

export type ExtractOutcomeContext = {
  uploadId: string;
  profileId: string;
  fileName: string;
  gradeLabel: string;
  semester: number;
  now: string;
};

export type ExtractResponse = {
  ok: true;
  uploadId: string;
  status: "ok" | "failed";
  extracted?: Extracted;
  error?: string;
  activityId?: string;
};

/** 파싱 결과를 업로드 행 갱신값, 활동 행, 응답으로 조립한다. activityId 는 insert 뒤 호출자가 붙인다. */
export function buildExtractOutcome(
  parse: ExtractionParse,
  ctx: ExtractOutcomeContext,
) {
  if (!parse.ok) {
    return {
      uploadUpdate: {
        extraction_status: "failed" as const,
        extraction_error: parse.reason,
        updated_at: ctx.now,
      },
      activityRow: null,
      response: {
        ok: true,
        uploadId: ctx.uploadId,
        status: "failed",
        error: parse.reason,
      } satisfies ExtractResponse,
    };
  }
  return {
    uploadUpdate: {
      extraction_status: "ok" as const,
      extracted: parse.extracted,
      updated_at: ctx.now,
    },
    activityRow: toActivityRecordFromExtraction({
      profileId: ctx.profileId,
      uploadId: ctx.uploadId,
      fileName: ctx.fileName,
      gradeLabel: ctx.gradeLabel,
      semester: ctx.semester,
      extracted: parse.extracted,
    }),
    response: {
      ok: true,
      uploadId: ctx.uploadId,
      status: "ok",
      extracted: parse.extracted,
    } satisfies ExtractResponse,
  };
}

/** 활동 선택 화면용 응답 행. planned 는 분석 재료가 아니라 뺀다(No.121). */
export function toActivityView(
  rows: readonly (ActivityRow & { topic: string | null })[],
) {
  return filterMaterialActivities(rows).map((r) => ({
    id: r.id,
    source: r.source_program,
    status: r.status,
    gradeLabel: r.grade_label,
    semester: r.semester,
    subjectGroup: r.subject_group,
    subject: r.subject,
    topic: r.topic,
  }));
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

const BUCKET = "growth-uploads";
const EXTRACT_TIMEOUT_MS = 45_000;
const PG_UNIQUE_VIOLATION = "23505";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  sendError(res, "coded", status, message, code, { ok: false });
}

type Db = SupabaseClient;

/** DB 오류를 던져 최상위 핸들러가 500 으로 처리하게 한다. */
function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** 쓰기 직후 반환 행이 반드시 있어야 하는 호출용. 없으면 던진다. */
function mustHave<T>(value: T, what: string): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${what}: 결과 없음`);
  return value as NonNullable<T>;
}

async function loadUploads(db: Db, userId: string) {
  return must(
    await db
      .from("growth_uploads")
      .select("id, grade_label, semester, extraction_status, file_name")
      .eq("profile_id", userId),
    "growth_uploads 조회 실패",
  ) as (UploadRow & { file_name: string })[];
}

async function handleSummary(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  body: SummaryBody,
) {
  let thresholds: { enough: number };
  try {
    thresholds = await readGrowthSetting(
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
  } catch (e) {
    if (e instanceof GrowthSettingError) {
      console.error("growth/collect 설정 오류:", e);
      fail(res, 500, "SETTING_MISSING", "성장설계 설정을 읽지 못했습니다.");
      return;
    }
    throw e;
  }

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
      .select("admission_year, grade, semester")
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
    profile: profile ?? { admission_year: null },
    naesinScores: goal?.naesin_scores ?? null,
    directGrades: body.directGrades,
    uploads,
  });

  const now = new Date().toISOString();
  must(
    await db
      .from("growth_reports")
      .update({
        track: body.track,
        grade_inputs: summary.gradeInputs,
        activity_ids: summary.analysisActivityIds,
        status: "in_progress",
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", reportId),
    "growth_reports 갱신 실패",
  );
  // survey_answers 는 건드리지 않는다. 트랙만 프로필에 맞춰 둔다.
  must(
    await db
      .from("growth_profiles")
      .upsert(
        { profile_id: userId, track: body.track, updated_at: now },
        { onConflict: "profile_id" },
      ),
    "growth_profiles 갱신 실패",
  );

  res.status(200).json({
    ok: true,
    reportId,
    summary,
    activities: toActivityView(rows),
  });
}

async function handleUploadUrl(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  body: UploadUrlBody,
) {
  const { upload } = body;
  const uploads = await loadUploads(db, userId);
  if (uploadQuotaLeft(uploads, upload.gradeLabel, upload.semester) === 0) {
    fail(
      res,
      409,
      "UPLOAD_LIMIT",
      "이 학기에는 파일을 10개까지 올릴 수 있어요.",
    );
    return;
  }

  const inserted = mustHave(
    must(
      await db
        .from("growth_uploads")
        .insert({
          profile_id: userId,
          grade_label: upload.gradeLabel,
          semester: upload.semester,
          file_name: upload.fileName,
          mime_type: upload.mimeType,
          byte_size: upload.byteSize,
          consent_at: new Date().toISOString(),
          extraction_status: "pending",
        })
        .select("id")
        .single(),
      "growth_uploads 등록 실패",
    ),
    "growth_uploads 등록 실패",
  );

  const path = uploadObjectPath(userId, reportId, inserted.id, upload.ext);
  const signed = mustHave(
    must(
      await db.storage.from(BUCKET).createSignedUploadUrl(path),
      "서명 업로드 URL 발급 실패",
    ),
    "서명 업로드 URL 발급 실패",
  );

  res.status(200).json({
    ok: true,
    uploadId: inserted.id,
    bucket: BUCKET,
    path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}

async function handleExtract(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  body: ExtractBody,
) {
  const row = must(
    await db
      .from("growth_uploads")
      .select(
        "id, grade_label, semester, file_name, mime_type, extraction_status",
      )
      .eq("id", body.uploadId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "growth_uploads 조회 실패",
  );
  if (!row) {
    fail(res, 404, "UPLOAD_NOT_FOUND", "업로드 기록을 찾을 수 없어요.");
    return;
  }
  if (row.extraction_status !== "pending") {
    fail(res, 409, "UPLOAD_NOT_PENDING", "이미 처리된 파일이에요.");
    return;
  }
  const ext = ALLOWED_UPLOAD_MIME[row.mime_type];
  if (ext === undefined || row.grade_label == null || row.semester == null) {
    throw new Error(`growth_uploads 행이 올바르지 않습니다: ${row.id}`);
  }

  const path = uploadObjectPath(userId, reportId, row.id, ext);
  const ctx: ExtractOutcomeContext = {
    uploadId: row.id,
    profileId: userId,
    fileName: row.file_name,
    gradeLabel: row.grade_label,
    semester: row.semester,
    now: new Date().toISOString(),
  };
  const markFailed = async (reason: string) => {
    must(
      await db
        .from("growth_uploads")
        .update({
          extraction_status: "failed",
          extraction_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id),
      "growth_uploads 실패 기록 실패",
    );
  };

  try {
    const { data: blob, error: downloadError } = await db.storage
      .from(BUCKET)
      .download(path);
    if (downloadError || !blob) {
      console.error("growth/collect 원본 다운로드 실패:", downloadError);
      await markFailed("객체 없음");
      fail(
        res,
        410,
        "UPLOAD_OBJECT_MISSING",
        "올린 파일을 찾을 수 없어요. 다시 올려 주세요.",
      );
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let parse: ExtractionParse | null = null;
    let uploadText: UploadText | null = null;
    try {
      uploadText = await textFromUpload({ mimeType: row.mime_type, bytes });
    } catch (e) {
      console.error("growth/collect 원문 해석 실패:", e);
      parse = { ok: false, reason: "원문 해석 실패" };
    }

    if (uploadText) {
      const mode = decideExtractionMode(uploadText);
      if (mode === "unsupported") {
        parse = { ok: false, reason: "지원하지 않는 형식" };
      } else {
        const prompt = buildExtractionPrompt({
          fileName: row.file_name,
          gradeLabel: row.grade_label,
          semester: row.semester,
          mode,
          ...(uploadText.kind === "text" ? { text: uploadText.text } : {}),
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
        const options = {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_RESPONSE_SCHEMA,
          abortSignal: controller.signal,
        };
        try {
          const raw =
            mode === "text"
              ? await callText(prompt.system, prompt.user, options)
              : await callVision(
                  prompt.system,
                  [{ data: bytes, mimeType: row.mime_type }],
                  prompt.user,
                  options,
                );
          parse = parseExtractionResponse(raw);
        } catch (modelError) {
          console.error("growth/collect 모델 호출 실패:", modelError);
          await markFailed("모델 호출 실패");
          fail(
            res,
            502,
            "EXTRACTION_UPSTREAM_FAILED",
            "자료를 분석하지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
          return;
        } finally {
          clearTimeout(timer);
        }
      }
    }

    if (!parse) throw new Error("추출 결과가 비어 있습니다.");
    const outcome = buildExtractOutcome(parse, ctx);
    must(
      await db
        .from("growth_uploads")
        .update(outcome.uploadUpdate)
        .eq("id", row.id),
      "growth_uploads 갱신 실패",
    );

    let activityId: string | undefined;
    if (outcome.activityRow) {
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

    res.status(200).json({
      ...outcome.response,
      ...(activityId ? { activityId } : {}),
    });
  } finally {
    // 원문 미보관: 성공, 실패, 예외 어느 경로든 객체를 지운다.
    const { error: removeError } = await db.storage.from(BUCKET).remove([path]);
    if (removeError)
      console.error("growth/collect 원본 삭제 실패:", removeError);
  }
}

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "성장설계 활동 집계에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/collect",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    const validated = validateCollectBody(req.body);
    if (!validated.ok) {
      fail(res, validated.status, validated.code, validated.reason);
      return;
    }
    const body = validated.body;

    const report = must(
      await ctx.supabaseAdmin
        .from("growth_reports")
        .select("id")
        .eq("profile_id", userId)
        .in("status", ["draft", "in_progress"])
        .maybeSingle(),
      "growth_reports 조회 실패",
    );
    if (!report) {
      fail(
        res,
        404,
        "NO_OPEN_REPORT",
        "진행 중인 회차가 없어요. 학생 조사부터 시작해 주세요.",
      );
      return;
    }

    if (body.action === "summary") {
      await handleSummary(res, ctx.supabaseAdmin, userId, report.id, body);
    } else if (body.action === "upload-url") {
      await handleUploadUrl(res, ctx.supabaseAdmin, userId, report.id, body);
    } else {
      await handleExtract(res, ctx.supabaseAdmin, userId, report.id, body);
    }
  },
});
