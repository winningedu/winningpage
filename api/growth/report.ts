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
//         completion 은 8단계 성공 시 { issuedAt, planItemCount }.
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
// 이미 차감된 회차(ledger_id 있음)의 재시도는 다시 차감하지 않는다. 2단계 이상인데 ledger_id 가
// 없으면(1단계 차감이 경쟁으로 거절된 회차) 선점 전에 차감을 다시 시도하고, 성공이 아니면
// 403 NO_ENTITLEMENT 로 거절한다(선점하지 않아 attempts 불변). 성공하면 진행하고 charged true 를 싣는다. 차감 RPC 가 거절해도
// (no_entitlement, quota_exhausted 등) 1단계 응답은 막지 않고 charged false 로 알리며, 다음 단계
// 요청에서 위 재시도로 막는다. 1단계는 선점 전에 이용권을 확인하므로 거절은 경쟁 상황에서만 생긴다.
//
// 종결 규칙: fatal 이거나 그 단계 시도가 상한에 닿으면 회차를 archived 로 닫고
// step_state.terminal 을 남기며, 차감한 이력이 있고 되돌리지 않았다면 되돌린다.
// 완료(completed) 회차는 되돌리지 않는다(reverse_growth_credit 이 거절).
//
// 핸들러 본문은 DB, Gemini 에 묶여 있어 단위 테스트하지 않는다. 판단 로직은
// _lib/growth/report/reportBody 에서 검증한다.

import type { VercelResponse } from "@vercel/node";
import { callText } from "../_lib/gemini.js";
import type { Db } from "../_lib/growth/intake/collectDb.js";
import {
  callModelWith,
  claimErrorOf,
  failureErrorOf,
  shouldTerminate,
  stepResponse,
  toStoredOutputs,
  validateReportBody,
} from "../_lib/growth/report/reportBody.js";
import {
  claimStep,
  completeReport,
  consumeCredit,
  finishStep,
  loadCarried,
  loadContextInputs,
  loadPreviousReportId,
  loadReportRow,
  type ReportDbRow,
  reverseCredit,
  terminateReport,
} from "../_lib/growth/report/reportDb.js";
import { runStep } from "../_lib/growth/report/runStep.js";
import { parseStepState, progress } from "../_lib/growth/report/stepState.js";
import {
  STEP_BUDGET_MS,
  type StepNumber,
} from "../_lib/growth/report/types.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

/** 차감 이력이 있고 아직 되돌리지 않은 회차면 되돌린다. 실패해도 응답을 막지 않는다. */
async function reverseIfCharged(
  db: Db,
  userId: string,
  row: ReportDbRow,
): Promise<void> {
  if (row.ledger_id === null || row.ledger_reversed_at !== null) return;
  try {
    const r = await reverseCredit(db, userId, row.id);
    if (!r.reversed) console.warn("growth/report 차감 되돌림 안 됨:", r.status);
  } catch (e) {
    console.error("growth/report 차감 되돌림 실패:", e);
  }
}

async function terminate(
  db: Db,
  userId: string,
  row: ReportDbRow,
  step: StepNumber,
  kind: "exhausted" | "fatal",
) {
  await terminateReport(
    db,
    userId,
    row.id,
    step,
    kind,
    new Date().toISOString(),
  );
  await reverseIfCharged(db, userId, row);
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

    // 선점 전에 막아야 거절된 요청이 시도 횟수를 올리지 않는다.
    if (step === 1 && row.ledger_id === null) {
      const config = SERVICE_CONFIGS.growth;
      if (!config) throw new Error("SERVICE_CONFIGS.growth 가 없습니다.");
      const { allowed } = await hasPaidServiceAccess(db, userId, config);
      if (!allowed) {
        fail(res, 403, "NO_ENTITLEMENT", "성장설계 이용권이 필요해요.");
        return;
      }
    }

    // 1단계 차감이 경쟁으로 거절된 회차(2단계 이상인데 ledger_id 없음)는 선점 전에 차감을 다시 시도한다.
    let lateCharged = false;
    if (step >= 2 && row.ledger_id === null) {
      const c = await consumeCredit(db, userId, reportId);
      if (!(c.charged || c.status === "already_charged")) {
        fail(res, 403, "NO_ENTITLEMENT", "성장설계 이용권이 필요해요.");
        return;
      }
      lateCharged = true;
    }

    const claim = await claimStep(db, userId, reportId, step);
    if (claim.kind === "done") {
      res.status(200).json(
        stepResponse({
          reportId,
          step,
          state: parseStepState(row.step_state),
          result: "done",
        }),
      );
      return;
    }
    if (claim.kind !== "claimed") {
      if (claim.kind === "exhausted")
        await terminate(db, userId, row, step, "exhausted");
      const e = claimErrorOf(claim);
      fail(res, e.status, e.code, e.message, {
        progress: progress(parseStepState(row.step_state)),
        ...(claim.kind === "exhausted" && { terminal: true }),
      });
      return;
    }

    // 이 아래에서 던지면 선점한 단계를 실패로 닫고 다시 던진다.
    try {
      let context: Awaited<ReturnType<typeof loadContextInputs>>;
      try {
        context = await loadContextInputs(
          db,
          userId,
          row,
          new Date().toISOString(),
        );
      } catch (e) {
        console.error("growth/report 컨텍스트 조립 실패:", e);
        await finishStep(
          db,
          userId,
          reportId,
          step,
          false,
          {},
          [
            {
              code: "context_error",
              message: "리포트 입력을 조립하지 못했어요.",
            },
          ],
          0,
        );
        fail(res, 500, "CONTEXT_ERROR", "리포트 입력을 준비하지 못했어요.");
        return;
      }

      const carried =
        step === 8
          ? await loadCarried(
              db,
              userId,
              await loadPreviousReportId(db, userId),
            )
          : undefined;
      const result = await runStep(step, context, toStoredOutputs(row), {
        callModel: callModelWith(callText),
        now: () => new Date().toISOString(),
        budgetMs: STEP_BUDGET_MS - (Date.now() - startedAt),
        ...(carried !== undefined && { carried }),
      });

      const stateNow = async () => {
        const fresh = await loadReportRow(db, userId, reportId);
        return fresh ?? row;
      };

      if (result.ok) {
        let completion: { issuedAt: string; planItemCount: number } | undefined;
        let alreadyCompleted = false;
        if (result.completion) {
          const done = await completeReport(
            db,
            userId,
            reportId,
            result.completion,
          );
          if (!done.ok) {
            // 선점한 running 을 닫지 않으면 stale 시간까지 재요청이 STEP_RUNNING 에 막힌다.
            await finishStep(
              db,
              userId,
              reportId,
              step,
              false,
              {},
              [{ code: "complete_failed", message: done.reason }],
              0,
            );
            if (done.reason === "not_ready") {
              fail(
                res,
                409,
                "REPORT_NOT_READY",
                "앞 단계 산출물이 아직 준비되지 않았어요.",
              );
              return;
            }
            fail(
              res,
              409,
              "STEP_SUPERSEDED",
              "다른 요청이 이미 이 단계를 처리했어요.",
            );
            return;
          }
          alreadyCompleted = done.reason === "already_completed";
          if (done.issuedAt !== undefined && done.planItemCount !== undefined)
            completion = {
              issuedAt: done.issuedAt,
              planItemCount: done.planItemCount,
            };
        } else {
          const finished = await finishStep(
            db,
            userId,
            reportId,
            step,
            true,
            result.patch,
            [],
            result.extraAttempts,
          );
          if (!finished) {
            fail(
              res,
              409,
              "STEP_SUPERSEDED",
              "다른 요청이 이미 이 단계를 처리했어요.",
            );
            return;
          }
        }

        // No.14: 첫 모델 호출 단계(1단계) 성공 시 차감. 거절돼도 진행은 막지 않는다.
        let charged: boolean | undefined = lateCharged ? true : undefined;
        if (step === 1 && row.ledger_id === null) {
          try {
            const c = await consumeCredit(db, userId, reportId);
            charged = c.charged || c.status === "already_charged";
            if (!charged) console.warn("growth/report 차감 거절:", c.status);
          } catch (e) {
            console.error("growth/report 차감 실패:", e);
            charged = false;
          }
        }

        const fresh = await stateNow();
        res.status(200).json(
          stepResponse({
            reportId,
            step,
            state: parseStepState(fresh.step_state),
            result: alreadyCompleted ? "done" : "ok",
            ...(charged !== undefined && { charged }),
            ...(completion !== undefined && { completion }),
          }),
        );
        return;
      }

      await finishStep(
        db,
        userId,
        reportId,
        step,
        false,
        {},
        result.issues,
        result.extraAttempts,
      );
      const fresh = await stateNow();
      const state = parseStepState(fresh.step_state);
      const e = failureErrorOf(result.failure);
      if (shouldTerminate(state, step, result.failure)) {
        await terminate(
          db,
          userId,
          fresh,
          step,
          result.failure === "fatal" ? "fatal" : "exhausted",
        );
        fail(res, e.status, e.code, e.message, {
          terminal: true,
          issues: result.issues,
          progress: progress(state),
        });
        return;
      }
      fail(res, e.status, e.code, e.message, {
        attempts: state.steps[step]?.attempts,
        issues: result.issues,
        progress: progress(state),
      });
    } catch (e) {
      try {
        await finishStep(
          db,
          userId,
          reportId,
          step,
          false,
          {},
          [{ code: "internal", message: "예기치 못한 오류" }],
          0,
        );
      } catch (inner) {
        console.error("growth/report 실패 기록 중 오류(무시):", inner);
      }
      throw e;
    }
  },
});
