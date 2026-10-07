// POST /api/growth/collect
// Authorization: Bearer <access_token>
//
// 성장설계 자료 수집 엔드포인트(명세 No.118). action 네 갈래.
//   summary    활동 집계와 성적 입력 정리. 읽기 전용이라 어떤 테이블에도 쓰지 않는다(No.37~51, No.113)
//              응답 {ok, reportId, summary, activities}
//   commit     리포트 만들기 시점에 집계를 회차에 고정한다(fn_growth_commit_collect)
//              응답 {ok, reportId, summary, committed: true}
//   upload-url 업로드 메타 등록과 서명 업로드 URL 발급(No.42, No.122)
//              응답 {ok, uploadId, bucket, path, token, signedUrl}
//   extract    업로드 파일에서 네 항목 추출(No.43, No.145)
//              응답 {ok, uploadId, status, extracted?, error?, activityId?}
//
// 계약: 클라이언트는 추출이 끝나면 summary 를 다시 불러 집계를 갱신하고, commit 시점의 집계가
// 고정된다. 추출로 생긴 활동은 회차 activity_ids 에 따로 덧붙이지 않는다.
// 오류: INVALID_BODY 400, UNSUPPORTED_MIME 415, FILE_TOO_LARGE 413, NO_OPEN_REPORT 404,
// UPLOAD_LIMIT 409, UPLOAD_NOT_FOUND 404, UPLOAD_NOT_PENDING 409, UPLOAD_OBJECT_MISSING 410,
// UPLOADS_PENDING 409, REPORT_LOCKED 409, EXTRACTION_UPSTREAM_FAILED 502,
// EXTRACTION_TIMEOUT 504, SETTING_MISSING 500, INTERNAL 500.
//
// 핸들러 본문은 DB, Storage, Gemini 에 묶여 있어 단위 테스트하지 않는다. 판단 로직은
// _lib/growth/intake 의 순수 함수(collectBody, extractOutcome, collectSummary)에서 검증한다.

import type { VercelResponse } from "@vercel/node";
import { createAiTrace } from "../_lib/aiTelemetry/trace.js";
import { GrowthSettingError } from "../_lib/growth/intake/appSettings.js";
import {
  type AggregateInput,
  type ExtractBody,
  type UploadUrlBody,
  validateCollectBody,
} from "../_lib/growth/intake/collectBody.js";
import {
  applyOutcome,
  claimUpload,
  computeSummary,
  type Db,
  findOpenReportId,
  loadUploads,
  must,
  mustHave,
  updateProcessing,
} from "../_lib/growth/intake/collectDb.js";
import { uploadQuotaLeft } from "../_lib/growth/intake/collectSummary.js";
import {
  ALLOWED_UPLOAD_MIME,
  uploadObjectPath,
} from "../_lib/growth/intake/extraction.js";
import {
  exceedsUploadLimit,
  toActivityView,
} from "../_lib/growth/intake/extractOutcome.js";
import {
  BUCKET,
  EXTRACTION_FAILURES,
  runExtraction,
} from "../_lib/growth/intake/extractRunner.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

// ---------------------------------------------------------------------------
// summary, commit
// ---------------------------------------------------------------------------

async function handleSummary(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  body: AggregateInput,
) {
  const { summary, rows } = await computeSummary(db, userId, body);
  res
    .status(200)
    .json({ ok: true, reportId, summary, activities: toActivityView(rows) });
}

async function handleCommit(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  body: AggregateInput,
) {
  const { summary } = await computeSummary(db, userId, body);
  if (summary.uploadsPending > 0) {
    fail(
      res,
      409,
      "UPLOADS_PENDING",
      "아직 처리 중인 파일이 있어요. 추출을 끝내거나 잠시 뒤 다시 시도해 주세요.",
      { uploads: summary.uploads },
    );
    return;
  }
  const committed = must(
    await db.rpc("fn_growth_commit_collect", {
      p_report_id: reportId,
      p_profile_id: userId,
      p_track: body.track,
      p_grade_inputs: summary.gradeInputs,
      p_activity_ids: summary.analysisActivityIds,
    }),
    "fn_growth_commit_collect 실패",
  );
  if (committed !== true) {
    fail(
      res,
      409,
      "REPORT_LOCKED",
      "리포트 생성이 시작된 회차는 다시 집계할 수 없어요.",
    );
    return;
  }
  // survey_answers 는 건드리지 않는다. 트랙만 프로필에 맞춰 둔다.
  must(
    await db.from("growth_profiles").upsert(
      {
        profile_id: userId,
        track: body.track,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    ),
    "growth_profiles 갱신 실패",
  );
  res.status(200).json({ ok: true, reportId, summary, committed: true });
}

// ---------------------------------------------------------------------------
// upload-url
// ---------------------------------------------------------------------------

async function handleUploadUrl(
  res: VercelResponse,
  db: Db,
  userId: string,
  body: UploadUrlBody,
) {
  const { upload } = body;
  const limitMessage = "이 학기에는 파일을 10개까지 올릴 수 있어요.";
  const before = await loadUploads(db, userId);
  if (uploadQuotaLeft(before, upload.gradeLabel, upload.semester) === 0) {
    fail(res, 409, "UPLOAD_LIMIT", limitMessage);
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
  // 동시 요청이 사전 조회를 함께 통과할 수 있어, insert 뒤 다시 세어 초과분을 되돌린다.
  const after = await loadUploads(db, userId);
  if (exceedsUploadLimit(after, upload.gradeLabel, upload.semester)) {
    must(
      await db
        .from("growth_uploads")
        .delete()
        .eq("id", inserted.id)
        .eq("profile_id", userId),
      "growth_uploads 되돌리기 실패",
    );
    fail(res, 409, "UPLOAD_LIMIT", limitMessage);
    return;
  }
  const path = uploadObjectPath(userId, inserted.id, upload.ext);
  const signedResult = await db.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signedResult.error || !signedResult.data) {
    // 발급 실패로 pending 행이 학기 상한을 잡아먹지 않게 방금 행을 지운다.
    const { error: rollbackError } = await db
      .from("growth_uploads")
      .delete()
      .eq("id", inserted.id)
      .eq("profile_id", userId);
    if (rollbackError)
      console.error("growth/collect 업로드 행 되돌리기 실패:", rollbackError);
    throw new Error(
      `서명 업로드 URL 발급 실패: ${signedResult.error?.message ?? "결과 없음"}`,
    );
  }
  const signed = signedResult.data;
  res.status(200).json({
    ok: true,
    uploadId: inserted.id,
    bucket: BUCKET,
    path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}

// ---------------------------------------------------------------------------
// extract: 선점, 다운로드와 모델 호출, 결과 반영
// ---------------------------------------------------------------------------

async function handleExtract(
  res: VercelResponse,
  db: Db,
  userId: string,
  body: ExtractBody,
  startedAt: number,
) {
  const row = await claimUpload(db, userId, body.uploadId);
  if (!row) {
    const exists = must(
      await db
        .from("growth_uploads")
        .select("id")
        .eq("id", body.uploadId)
        .eq("profile_id", userId)
        .maybeSingle(),
      "growth_uploads 조회 실패",
    );
    if (!exists) {
      fail(res, 404, "UPLOAD_NOT_FOUND", "업로드 기록을 찾을 수 없어요.");
    } else {
      fail(res, 409, "UPLOAD_NOT_PENDING", "이미 처리된 파일이에요.");
    }
    return;
  }
  const ext = ALLOWED_UPLOAD_MIME[row.mime_type];
  const path = ext ? uploadObjectPath(userId, row.id, ext) : null;
  const trace = createAiTrace({
    service: "growth",
    feature: "extract",
    targetKind: "growth_upload",
    targetId: row.id,
    profileId: userId,
  });
  try {
    if (!path || row.grade_label == null || row.semester == null) {
      throw new Error(`growth_uploads 행이 올바르지 않습니다: ${row.id}`);
    }
    const extraction = await runExtraction(
      db,
      { ...row, grade_label: row.grade_label, semester: row.semester },
      path,
      startedAt,
      trace,
    );
    if (extraction.kind === "parsed") {
      const body = await applyOutcome(
        db,
        userId,
        {
          uploadId: row.id,
          profileId: userId,
          fileName: row.file_name,
          gradeLabel: row.grade_label,
          semester: row.semester,
          now: new Date().toISOString(),
        },
        extraction.parse,
      );
      res.status(200).json(body);
      return;
    }
    const [status, code, reason, message] =
      EXTRACTION_FAILURES[extraction.kind];
    await updateProcessing(db, userId, row.id, {
      extraction_status: "failed",
      extraction_error: reason,
      updated_at: new Date().toISOString(),
    });
    fail(res, status, code, message);
  } catch (e) {
    // 예외로 끝나도 processing 에 갇히지 않게 실패로 돌려 둔다(기록 실패는 무시).
    await updateProcessing(db, userId, row.id, {
      extraction_status: "failed",
      extraction_error: "내부 오류",
      updated_at: new Date().toISOString(),
    }).catch(() => undefined);
    throw e;
  } finally {
    await trace.flush(db);
    // 원문 미보관: 성공, 실패, 예외 어느 경로든 객체를 지운다.
    if (path) {
      const { error: removeError } = await db.storage
        .from(BUCKET)
        .remove([path]);
      if (removeError)
        console.error("growth/collect 원본 삭제 실패:", removeError);
    }
  }
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

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
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateCollectBody(req.body);
    if (!validated.ok) {
      fail(res, validated.status, validated.code, validated.reason);
      return;
    }
    const body = validated.body;

    const reportId = await findOpenReportId(db, userId);
    if (!reportId) {
      fail(
        res,
        404,
        "NO_OPEN_REPORT",
        "진행 중인 회차가 없어요. 학생 조사부터 시작해 주세요.",
      );
      return;
    }

    try {
      if (body.action === "summary") {
        await handleSummary(res, db, userId, reportId, body);
      } else if (body.action === "commit") {
        await handleCommit(res, db, userId, reportId, body);
      } else if (body.action === "upload-url") {
        await handleUploadUrl(res, db, userId, body);
      } else {
        await handleExtract(res, db, userId, body, startedAt);
      }
    } catch (e) {
      if (!(e instanceof GrowthSettingError)) throw e;
      console.error("growth/collect 설정 오류:", e);
      fail(res, 500, "SETTING_MISSING", "성장설계 설정을 읽지 못했습니다.");
    }
  },
});
