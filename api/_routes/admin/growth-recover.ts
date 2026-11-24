// POST /api/admin/growth-recover { reportId }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 종결(archived + step_state.terminal)된 회차를 같은 입력 재료로 새로 시작한다.
// 새 회차는 in_progress, current_step 0, step_state 비어 있음이라 학생이 생성 화면에서 바로
// 다시 만들 수 있다. 원본은 그대로 두고 step_state.recoveredTo 에 새 회차 id 만 남긴다.
//
// 차감: 종결 때 원본의 차감은 이미 되돌려졌다(fn_growth_terminate_report). 새 회차는 ledger_id 가
// 없으므로 1단계 성공 시점에 다시 차감된다. 복구 자체는 차감하지 않는다.
//
// 응답 200 { newReportId }
// 오류(problem): 400 VALIDATION_FAILED(모양, 정의되지 않은 키), 400 INVALID_BODY(값 규칙), 404 REPORT_NOT_FOUND, 409 NOT_RECOVERABLE,
//   409 ALREADY_RECOVERED, 409 OPEN_REPORT_EXISTS, 401/403 인증, 405, 500 INTERNAL_ERROR
// 원본 기록이 0행이면(확인 뒤 상태가 바뀜) 만든 회차을 지우고 409 NOT_RECOVERABLE 이다.
// 권한: 메뉴 growthReports edit.
//
// 판정과 복제는 api/_lib/growth/ops/recover.ts.

import { z } from "zod";
import {
  canRecover,
  cloneForRecovery,
  type RecoverSourceRow,
  validateRecoverBody,
} from "../../_lib/growth/ops/recover.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

const PG_UNIQUE_VIOLATION = "23505";

const SOURCE_COLUMNS =
  "id, profile_id, status, track, survey_answers, activity_ids, grade_inputs, step_state";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "growthReports" },
  methodNotAllowedMessage: "POST만 허용됩니다.",
  unhandledMessage: "성장설계 회차 복구에 실패했습니다.",
  logLabel: "admin/growth-recover",
  headers: { "Cache-Control": "no-store" },
  // 모양만 거르고 값 규칙과 한국어 사유는 validateRecoverBody 가 맡는다.
  body: z.object({ reportId: z.string() }).strict(),
  handler: async (_req, res, ctx) => {
    const parsed = validateRecoverBody(ctx.body);
    if (!parsed.ok) {
      sendError(res, "problem", 400, parsed.reason, "INVALID_BODY");
      return;
    }
    const db = ctx.supabaseAdmin;

    const { data: source, error: sourceError } = await db
      .from("growth_reports")
      .select(SOURCE_COLUMNS)
      .eq("id", parsed.reportId)
      .maybeSingle();
    if (sourceError)
      throw new Error(`growth_reports 조회 실패: ${sourceError.message}`);
    if (!source) {
      sendError(
        res,
        "problem",
        404,
        "회차를 찾을 수 없습니다.",
        "REPORT_NOT_FOUND",
      );
      return;
    }
    const row = source as RecoverSourceRow;

    const verdict = canRecover(row);
    if (!verdict.ok) {
      const message =
        verdict.code === "ALREADY_RECOVERED"
          ? "이미 복구한 회차입니다."
          : "복구할 수 없는 회차입니다. 종결된 회차만 복구할 수 있습니다.";
      sendError(res, "problem", 409, message, verdict.code);
      return;
    }

    const openMessage = "이 학생에게 진행 중인 회차가 있어 복구할 수 없습니다.";
    const { data: open, error: openError } = await db
      .from("growth_reports")
      .select("id")
      .eq("profile_id", row.profile_id)
      .in("status", ["draft", "in_progress"])
      .limit(1);
    if (openError) throw new Error(`미완 회차 조회 실패: ${openError.message}`);
    if ((open ?? []).length > 0) {
      sendError(res, "problem", 409, openMessage, "OPEN_REPORT_EXISTS");
      return;
    }

    const nowIso = new Date().toISOString();
    const { data: created, error: insertError } = await db
      .from("growth_reports")
      .insert(cloneForRecovery(row, nowIso))
      .select("id")
      .single();
    if (insertError) {
      // 위 확인과 insert 사이에 학생이 회차를 만든 경우(학생당 미완 1개 부분 유니크).
      if (insertError.code === PG_UNIQUE_VIOLATION) {
        sendError(res, "problem", 409, openMessage, "OPEN_REPORT_EXISTS");
        return;
      }
      throw new Error(`복구 회차 생성 실패: ${insertError.message}`);
    }

    const state =
      row.step_state && typeof row.step_state === "object"
        ? row.step_state
        : {};
    const { data: marked, error: markError } = await db
      .from("growth_reports")
      .update({ step_state: { ...state, recoveredTo: created.id } })
      .eq("id", row.id)
      .eq("status", "archived")
      .select("id");
    if (markError)
      throw new Error(`원본 recoveredTo 기록 실패: ${markError.message}`);
    if ((marked ?? []).length === 0) {
      // 확인 뒤 원본이 종결 상태를 벗어났다. 성공으로 답하지 않고 방금 만든 회차을 되돌린다.
      await db.from("growth_reports").delete().eq("id", created.id);
      sendError(
        res,
        "problem",
        409,
        "복구할 수 없는 회차입니다. 종결된 회차만 복구할 수 있습니다.",
        "NOT_RECOVERABLE",
      );
      return;
    }

    res.status(200).json({ newReportId: created.id });
  },
});

export const config = { runtime: "nodejs" };
