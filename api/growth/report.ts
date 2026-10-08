// POST /api/growth/report
// Authorization: Bearer <access_token>
//
// 성장설계 리포트 생성 엔드포인트. 요청 한 번에 한 단계(1~8)를 실행한다(명세 No.75, No.89).
// 클라이언트는 응답의 nextStep 으로 다음 단계를 이어서 부른다.
//
// 요청  { reportId: uuid, step: 1~8 }
// 응답  200 { ok: true, reportId, step, result: "ok" | "done", attempts, nextStep, progress,
//             charged?, completion? }
//         result "done" 은 이미 성공한 단계를 다시 요청한 멱등 응답이다(저장분 유지).
//         charged 는 1단계 성공 직후 차감을 시도했을 때만 실린다(false 면 차감하지 못한 것).
//         completion 은 8단계 성공 시 { issuedAt, planItemCount }. 이때 result 는 "ok", nextStep 은
//         null 이다(모든 단계 완료). 이미 완료된 회차의 8단계 재요청은 result "done" 이다.
//         progress 는 8단계 { step, label, status, attempts } 목록이다.
//       실패 응답은 모두 { ok: false, code, message, ... } 이고 모델 실패류에는
//         attempts, issues, progress 가, 종결 시에는 terminal: true 가 함께 실린다.
//
// 오류 코드
//   INVALID_BODY 400, REPORT_NOT_FOUND 404, NO_ENTITLEMENT 403(1단계 선점 전),
//   REPORT_LOCKED 409(draft, in_progress 가 아님), STEP_ORDER 409(앞 단계 미완),
//   STEP_RUNNING 409(같은 단계 실행 중), ATTEMPTS_EXHAUSTED 409(시도 상한, 회차 종결),
//   REPORT_NOT_READY 409(8단계인데 1~7단계 산출이 비어 있음),
//   STEP_SUPERSEDED 409(다른 요청이 같은 단계를 먼저 닫음),
//   STEP_VALIDATION_FAILED 422, MODEL_UPSTREAM_FAILED 502, STEP_TIMEOUT 504,
//   STEP_FATAL 500(복구 불가, 회차 종결), CONTEXT_ERROR 500(입력 조립 실패), INTERNAL 500.
//
// 차감 시점(No.14): 1단계가 성공한 직후 회차 1개를 한 번만 차감한다(consume_growth_credit).
// 이미 차감된 회차(ledger_id 있음)의 재시도는 다시 차감하지 않는다. 2단계 이상인데 차감 이력이
// 없으면(1단계 차감이 경쟁으로 거절된 회차) 열린 회차(draft, in_progress)에 한해 선점 전에 차감을
// 다시 시도하고, 성공이 아니면 403 NO_ENTITLEMENT 로 거절한다(선점하지 않아 attempts 불변).
// 닫힌 회차(completed, archived)는 차감하지 않고 409 REPORT_LOCKED 로 거절한다.
// 성공하면 진행하고 charged true 를 싣는다. 차감 RPC 가 거절해도
// (no_entitlement, quota_exhausted 등) 1단계 응답은 막지 않고 charged false 로 알리며, 다음 단계
// 요청에서 위 재시도로 막는다. 1단계는 선점 전에 이용권을 확인하므로 거절은 경쟁 상황에서만 생긴다.
//
// 1단계가 charged false 로 끝난 뒤 2단계에서 403 NO_ENTITLEMENT 가 나면, 클라이언트는 이용권을
// 구매하게 한 다음 같은 reportId 로 2단계를 다시 부른다(1단계의 모델 비용은 이미 발생했다).
// 409 STEP_RUNNING 은 3초 뒤 같은 요청을 다시 보낸다. 실패 응답의 attempts 는 그 단계의 모델 호출
// 누계이고, 상한 10(MAX_MODEL_ATTEMPTS_PER_STEP)과 함께 "n/10" 으로 표시한다. 상한에 닿으면
// terminal: true 로 회차가 종결된다.
// 창을 닫아도 크론(api/cron/growth-resume, 2분 간격)이 멈춘 회차의 다음 단계를 이어간다(No.79).
//
// 종결 규칙: fatal 이거나 그 단계 시도가 상한에 닿으면 회차를 archived 로 닫고
// step_state.terminal 을 남기며, 차감한 이력이 있고 되돌리지 않았다면 되돌린다
// (종결 RPC 가 잠금 안에서 판단한다).
// 완료(completed) 회차는 되돌리지 않는다(reverse_growth_credit 이 거절).
//
// 핸들러는 바디 검증, 회차 조회, advanceStep 호출, 결과의 HTTP 매핑만 한다. 단계 진행 규칙은
// _lib/growth/report/advance 에, 판단 로직은 _lib/growth/report/reportBody 에 있고 거기서 검증한다.

import type { VercelResponse } from "@vercel/node";
import { callStructured } from "../_lib/ai/gemini.js";
import {
  type AdvanceOutcome,
  advanceStep,
} from "../_lib/growth/report/advance.js";
import {
  claimErrorOf,
  failureErrorOf,
  stepResponse,
  validateReportBody,
} from "../_lib/growth/report/reportBody.js";
import { loadReportRow } from "../_lib/growth/report/reportDb.js";
import { progress } from "../_lib/growth/report/stepState.js";
import type { StepNumber } from "../_lib/growth/report/types.js";
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

function respond(
  res: VercelResponse,
  reportId: string,
  step: StepNumber,
  outcome: AdvanceOutcome,
) {
  switch (outcome.kind) {
    case "done":
      res.status(200).json(
        stepResponse({
          reportId,
          step,
          state: outcome.state,
          result: "done",
        }),
      );
      return;
    case "ok":
      res.status(200).json(
        stepResponse({
          reportId,
          step,
          state: outcome.state,
          result: "ok",
          ...(outcome.charged !== undefined && { charged: outcome.charged }),
          ...(outcome.completion !== undefined && {
            completion: outcome.completion,
          }),
        }),
      );
      return;
    case "claim_error": {
      const e = claimErrorOf(outcome.claim);
      fail(res, e.status, e.code, e.message, {
        progress: progress(outcome.state),
        ...(outcome.terminal && { terminal: true }),
      });
      return;
    }
    case "no_entitlement":
      fail(res, 403, "NO_ENTITLEMENT", "성장설계 이용권이 필요해요.");
      return;
    case "context_error":
      fail(res, 500, "CONTEXT_ERROR", "리포트 입력을 준비하지 못했어요.");
      return;
    case "not_ready":
      fail(
        res,
        409,
        "REPORT_NOT_READY",
        "앞 단계 산출물이 아직 준비되지 않았어요.",
      );
      return;
    case "superseded":
      fail(
        res,
        409,
        "STEP_SUPERSEDED",
        "다른 요청이 이미 이 단계를 처리했어요.",
      );
      return;
    case "failure": {
      const e = failureErrorOf(outcome.failure);
      if (outcome.terminal) {
        fail(res, e.status, e.code, e.message, {
          terminal: true,
          issues: outcome.issues,
          progress: progress(outcome.state),
        });
        return;
      }
      fail(res, e.status, e.code, e.message, {
        attempts: outcome.state.steps[step]?.attempts,
        issues: outcome.issues,
        progress: progress(outcome.state),
      });
      return;
    }
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
  unhandledMessage: "성장설계 리포트 생성에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateReportBody(req.body);
    if (!validated.ok) {
      fail(res, 400, "INVALID_BODY", validated.reason);
      return;
    }
    const { reportId, step } = validated.body;

    const row = await loadReportRow(db, userId, reportId);
    if (!row) {
      fail(res, 404, "REPORT_NOT_FOUND", "리포트 회차를 찾을 수 없어요.");
      return;
    }

    const outcome = await advanceStep(db, userId, row, step, {
      callStructured,
      now: () => new Date().toISOString(),
      startedAt,
    });
    respond(res, reportId, step, outcome);
  },
});
