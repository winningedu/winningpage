// POST /api/diagnosis/submit  { attemptId, answers }
// Authorization: Bearer <access_token>
//
// Server-side scoring (judge-report 3-2): the server validates the v3 answers,
// fetches admission inputs, runs the engine and stores the report. Replaces the
// browser scoring plus api/_routes/diagnosis/report.ts save flow.
//
//   200 { ok: true, schemaVersion, payload }
//   400 INVALID_BODY | INVALID_ANSWERS
//   403 FORBIDDEN | ATTEMPT_NOT_COUNTED
//   404 ATTEMPT_NOT_FOUND
//   413 PAYLOAD_TOO_LARGE

import type { VercelResponse } from "@vercel/node";
import {
  type DiagnosisV3Context,
  SCHEMA_VERSION,
  scoreDiagnosisV3,
  validateAnswers,
} from "../../../src/lib/diagnosis-v3/index.js";
import { ymdIn } from "../../../src/lib/time/day.js";
import { isValidTimeZone } from "../../../src/lib/time/zone.js";
import { fetchAdmissionInputs } from "../../_lib/diagnosis/admissionInputs.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same cap as report.ts (snapshot + payload); here it bounds the answers body.
const MAX_ANSWERS_BYTES = 512 * 1024;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "학습진단 채점에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "diagnosis/submit",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    const raw =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const attemptId =
      typeof raw.attemptId === "string" ? raw.attemptId.trim() : "";
    const answers = raw.answers;
    if (!UUID_RE.test(attemptId)) {
      fail(res, 400, "INVALID_BODY", "attemptId가 올바르지 않습니다.");
      return;
    }
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      fail(res, 400, "INVALID_BODY", "answers가 올바르지 않습니다.");
      return;
    }
    if (
      Buffer.byteLength(JSON.stringify(answers), "utf8") > MAX_ANSWERS_BYTES
    ) {
      fail(res, 413, "PAYLOAD_TOO_LARGE", "답안 데이터가 너무 큽니다.");
      return;
    }

    // Ownership and tenant rule moved as-is from report.ts.
    const { data: attemptRow, error: attemptError } = await ctx.supabaseAdmin
      .from("diagnosis_attempts")
      .select("profile_id, kind")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError) {
      console.error("diagnosis/submit attempt 조회 실패:", attemptError);
      fail(res, 500, "INTERNAL", "학습진단 채점에 실패했습니다.");
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
    if (isSchoolmentorSite() && attemptRow.kind !== "tenant") {
      fail(
        res,
        403,
        "ATTEMPT_NOT_COUNTED",
        "이용 횟수가 센 제출만 저장할 수 있습니다.",
      );
      return;
    }

    // Idempotent replay: a stored report is returned as is, never recomputed.
    const { data: stored, error: storedError } = await ctx.supabaseAdmin
      .from("diagnosis_reports")
      .select("schema_version, payload")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (storedError) {
      console.error("diagnosis/submit 기존 리포트 조회 실패:", storedError);
      fail(res, 500, "INTERNAL", "학습진단 채점에 실패했습니다.");
      return;
    }
    if (stored) {
      res.status(200).json({
        ok: true,
        schemaVersion: stored.schema_version,
        payload: stored.payload,
      });
      return;
    }

    // Student name, join date and diagnosis zone: profiles.name, created_at and
    // time_zone. The diagnosis day is the member's local day in profiles.time_zone,
    // set by the server (judge-report 3-2); a missing or invalid zone reads as UTC.
    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("name, created_at, time_zone")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("diagnosis/submit profile 조회 실패:", profileError);
      fail(res, 500, "INTERNAL", "학습진단 채점에 실패했습니다.");
      return;
    }
    const memberTz = isValidTimeZone(profile?.time_zone)
      ? profile.time_zone
      : "UTC";
    const diagnosedAt = ymdIn(new Date(), memberTz);
    const validated = validateAnswers(answers, diagnosedAt);
    if (!validated.ok) {
      fail(res, 400, "INVALID_ANSWERS", "답안이 올바르지 않습니다.", {
        errors: validated.errors,
      });
      return;
    }

    // (07 B24: a missing join date falls back to the diagnosis date in the engine).
    const name = typeof profile?.name === "string" ? profile.name.trim() : "";
    const context: DiagnosisV3Context = {
      diagnosedAt,
      joinedAt: profile?.created_at
        ? ymdIn(profile.created_at, memberTz)
        : null,
      admission: validated.answers.q15
        ? await fetchAdmissionInputs(ctx.supabaseAdmin, validated.answers.q15)
        : null,
      studentName: name.length > 0 ? name : null,
    };

    const payload = scoreDiagnosisV3(validated.answers, context);

    // Insert on conflict do nothing, then read back: two concurrent submits for
    // one attempt both answer with the single stored row.
    const { error: upsertError } = await ctx.supabaseAdmin
      .from("diagnosis_reports")
      .upsert(
        {
          attempt_id: attemptId,
          profile_id: userId,
          schema_version: SCHEMA_VERSION,
          diagnosed_at: diagnosedAt,
          snapshot: { answers: validated.answers, context },
          payload,
        },
        { onConflict: "attempt_id", ignoreDuplicates: true },
      );
    if (upsertError) {
      console.error("diagnosis/submit insert 실패:", upsertError);
      fail(res, 500, "INTERNAL", "학습진단 채점에 실패했습니다.");
      return;
    }
    const { data: saved, error: savedError } = await ctx.supabaseAdmin
      .from("diagnosis_reports")
      .select("schema_version, payload")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (savedError || !saved) {
      console.error("diagnosis/submit 저장 리포트 조회 실패:", savedError);
      fail(res, 500, "INTERNAL", "학습진단 채점에 실패했습니다.");
      return;
    }
    res.status(200).json({
      ok: true,
      schemaVersion: saved.schema_version,
      payload: saved.payload,
    });
  },
});

export const config = { runtime: "nodejs" };
