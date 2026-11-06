// POST /api/diagnosis/report  { attemptId, snapshot, payload, schemaVersion, diagnosedAt }
// Authorization: Bearer <access_token>
//
// 학습진단 리포트 영속화 — QA 시트 행 210. supabase/migrations/
// 20260902134950_diagnosis_reports.sql의 diagnosis_reports를 채우는 유일한
// 쓰기 경로다(RLS는 select만 있고 쓰기는 service_role 전용).
//
// 호출부는 SurveyStepShell.submitDiagnosis(제출 직후)와 리포트 페이지의
// ensureDiagnosisReportSaved(재시도) 둘이다. 둘 다 diagnosisReportApi.ts를
// 거치고, 이 라우트는 attemptId가 호출자 소유인지만 서버에서 재확인한다 —
// consume.ts가 이미 attemptId를 diagnosis_attempts에 기록해 뒀으므로 그 행의
// profile_id와 요청자를 대조하는 것으로 충분하다(다른 유저의 attemptId를
// 밀어넣는 시도를 막는다).
//
// 응답 규격은 consume.ts와 같은 관례(coded errorShape, ok:false를 extra로 얹음).
//
//   → 200 { ok: true }
//   → 400 INVALID_BODY
//   → 401 UNAUTHENTICATED
//   → 403 FORBIDDEN            — attemptId가 요청자 소유가 아님
//   403 ATTEMPT_NOT_COUNTED: 스쿨멘토에서 센 시도(kind tenant)가 아님
//   → 404 ATTEMPT_NOT_FOUND    — attemptId가 diagnosis_attempts에 없음(소진 전 저장 시도 등)
//   → 405 METHOD_NOT_ALLOWED
//   → 413 PAYLOAD_TOO_LARGE
//   → 500 INTERNAL

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../_lib/site.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// snapshot+payload 합산 상한. 정상 리포트(설문 응답 전문 + 조립된 리포트 본문)는
// 수십 KB 대다 — 512KB는 이상 페이로드(수기 조작·무한 확장 텍스트 등)만 걸러내는
// 넉넉한 상한이고, jsonb 컬럼 자체에는 별도 제약이 없어 여기서 막지 않으면 DB까지
// 그대로 흘러간다.
const MAX_PAYLOAD_BYTES = 512 * 1024;
// schemaVersion 은 "2026-08-fd2" 형태의 짧은 라벨이다 — 실수로 payload 통째를 넣는 오용만 막는다.
const SCHEMA_VERSION_MAX_LENGTH = 64;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

export type DiagnosisReportBody = {
  attemptId: string;
  snapshot: Record<string, unknown>;
  payload: Record<string, unknown>;
  schemaVersion: string;
  diagnosedAt: string;
};

/**
 * body 파싱·형태 검증만 담당하는 순수 함수 — I/O 없이 유닛 테스트한다
 * (delete-account.test.ts와 같은 방침, 핸들러 전체는 supabase I/O에 묶여 있어
 * 로컬 스택 QA로 확인한다).
 *
 * @returns 유효하면 정규화된 body, 아니면 실패 사유 코드.
 */
export function validateReportBody(
  raw: unknown,
): { ok: true; body: DiagnosisReportBody } | { ok: false; reason: string } {
  const b =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const attemptId = typeof b.attemptId === "string" ? b.attemptId.trim() : "";
  if (!UUID_RE.test(attemptId)) {
    return { ok: false, reason: "attemptId가 올바르지 않습니다." };
  }

  const snapshot = b.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, reason: "snapshot이 올바르지 않습니다." };
  }

  const payload = b.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "payload가 올바르지 않습니다." };
  }

  // SCHEMA_VERSION(src/data/renewalSurveyQuestions.ts)은 "2026-08-fd2" 같은 문자열 라벨이다 —
  // 컬럼도 text. 빈 문자열·비문자열·과도한 길이만 거른다.
  const schemaVersion =
    typeof b.schemaVersion === "string" ? b.schemaVersion.trim() : "";
  if (!schemaVersion || schemaVersion.length > SCHEMA_VERSION_MAX_LENGTH) {
    return { ok: false, reason: "schemaVersion이 올바르지 않습니다." };
  }

  const diagnosedAt = typeof b.diagnosedAt === "string" ? b.diagnosedAt : "";
  if (!diagnosedAt || Number.isNaN(Date.parse(diagnosedAt))) {
    return { ok: false, reason: "diagnosedAt이 올바르지 않습니다." };
  }

  return {
    ok: true,
    body: {
      attemptId,
      snapshot: snapshot as Record<string, unknown>,
      payload: payload as Record<string, unknown>,
      schemaVersion,
      diagnosedAt,
    },
  };
}

/** snapshot+payload 직렬화 바이트 합이 상한을 넘는지 판정하는 순수 함수. */
export function exceedsPayloadLimit(body: DiagnosisReportBody): boolean {
  const bytes =
    Buffer.byteLength(JSON.stringify(body.snapshot), "utf8") +
    Buffer.byteLength(JSON.stringify(body.payload), "utf8");
  return bytes > MAX_PAYLOAD_BYTES;
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "학습진단 리포트 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "diagnosis/report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    const validated = validateReportBody(req.body);
    if (!validated.ok) {
      fail(res, 400, "INVALID_BODY", validated.reason);
      return;
    }
    const body = validated.body;

    if (exceedsPayloadLimit(body)) {
      fail(res, 413, "PAYLOAD_TOO_LARGE", "리포트 데이터가 너무 큽니다.");
      return;
    }

    // attemptId 소유 확인 — consume.ts가 이미 이 attemptId로 diagnosis_attempts에
    // 행을 기록해 뒀어야 한다(소진 없이 저장을 시도하는 비정상 경로 차단).
    const { data: attemptRow, error: attemptError } = await ctx.supabaseAdmin
      .from("diagnosis_attempts")
      .select("profile_id, kind")
      .eq("id", body.attemptId)
      .maybeSingle();

    if (attemptError) {
      console.error("diagnosis/report attempt 조회 실패:", attemptError);
      fail(res, 500, "INTERNAL", "학습진단 리포트 저장에 실패했습니다.");
      return;
    }

    if (!attemptRow) {
      fail(res, 404, "ATTEMPT_NOT_FOUND", "제출 기록을 찾을 수 없습니다.");
      return;
    }

    if (attemptRow.profile_id !== userId) {
      fail(res, 403, "FORBIDDEN", "본인 제출 건만 저장할 수 있습니다.");
      return;
    }

    // 스쿨멘토는 기관 한도를 서버가 집행한다. fn_consume_tenant_diagnosis 가 센 시도(kind tenant)가
    // 아니면 저장하지 않는다. 한도 응답을 건너뛰거나 클라이언트가 실패를 흘려보내도 새 리포트가 생기지 않는다.
    if (isSchoolmentorSite() && attemptRow.kind !== "tenant") {
      fail(
        res,
        403,
        "ATTEMPT_NOT_COUNTED",
        "이용 횟수가 센 제출만 저장할 수 있습니다.",
      );
      return;
    }

    const { error: upsertError } = await ctx.supabaseAdmin
      .from("diagnosis_reports")
      .upsert(
        {
          attempt_id: body.attemptId,
          profile_id: userId,
          schema_version: body.schemaVersion,
          diagnosed_at: body.diagnosedAt,
          snapshot: body.snapshot,
          payload: body.payload,
        },
        { onConflict: "attempt_id" },
      );

    if (upsertError) {
      console.error("diagnosis/report upsert 실패:", upsertError);
      fail(res, 500, "INTERNAL", "학습진단 리포트 저장에 실패했습니다.");
      return;
    }

    res.status(200).json({ ok: true });
  },
});

export const config = { runtime: "nodejs" };
