// 성장설계 리포트 한 단계 진행 서비스. api/growth/report 핸들러와 크론(growth-resume)이 함께 쓴다.
// HTTP 를 모른다. 결과는 AdvanceOutcome 으로 돌려주고 응답 매핑은 호출자가 한다.

import { createAiTrace } from "../../aiTelemetry/trace.js";
import type { callStructured } from "../../gemini.js";
import { hasPaidServiceAccess, SERVICE_CONFIGS } from "../../serviceAccess.js";
import type { Db } from "../intake/collectDb.js";
import type { ValidationIssue } from "../validation.js";
import { notifyGrowthReportDone } from "./notify.js";
import {
  callModelWith,
  chargeGate,
  shouldTerminate,
  toStoredOutputs,
} from "./reportBody.js";
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
  terminateReportRpc,
} from "./reportDb.js";
import { runStep } from "./runStep.js";
import { parseStepState, terminalReasonFor } from "./stepState.js";
import {
  type ClaimResult,
  STEP_BUDGET_MS,
  type StepNumber,
  type StepState,
} from "./types.js";

/** 완료 알림을 기다리는 최대 시간. 8단계 요청 예산 보호용. */
const NOTIFY_WAIT_MS = 5000;

export type AdvanceDeps = {
  callStructured: typeof callStructured;
  now: () => string;
  /** 이 요청이 시작된 시각(Date.now). 단계 예산 계산에 쓴다. */
  startedAt: number;
};

export type AdvanceOutcome =
  | { kind: "done"; state: StepState }
  | {
      kind: "ok";
      state: StepState;
      charged?: boolean;
      completion?: { issuedAt: string; planItemCount: number };
    }
  | {
      kind: "claim_error";
      claim: Exclude<ClaimResult, { kind: "claimed" } | { kind: "done" }>;
      state: StepState;
      terminal: boolean;
    }
  | { kind: "no_entitlement"; reason: string }
  | { kind: "context_error" }
  | { kind: "superseded" }
  | { kind: "not_ready" }
  | {
      kind: "failure";
      failure: "validation" | "upstream" | "timeout" | "fatal";
      issues: ValidationIssue[];
      state: StepState;
      terminal: boolean;
    };

/**
 * 회차를 archived 로 닫고 필요하면 차감을 되돌린다. 되돌릴지는 종결 RPC 가
 * 잠금 안에서 판단한 needsReverse 만 믿는다. 되돌림 실패는 응답을 막지 않는다.
 */
export async function terminateAndReverse(
  db: Db,
  userId: string,
  reportId: string,
  step: StepNumber,
  kind: "exhausted" | "fatal",
): Promise<void> {
  const t = await terminateReportRpc(
    db,
    userId,
    reportId,
    step,
    terminalReasonFor(kind, step),
  );
  if (!t.needsReverse) return;
  try {
    const r = await reverseCredit(db, userId, reportId);
    if (!r.reversed) console.warn("growth/report 차감 되돌림 안 됨:", r.status);
  } catch (e) {
    console.error("growth/report 차감 되돌림 실패:", e);
  }
}

async function freshState(
  db: Db,
  userId: string,
  row: ReportDbRow,
): Promise<StepState> {
  const fresh = await loadReportRow(db, userId, row.id);
  return parseStepState((fresh ?? row).step_state);
}

/** row 는 호출자가 방금 읽은 회차 행이다. 단계 하나를 선점하고 실행해 결과를 돌려준다. */
export async function advanceStep(
  db: Db,
  userId: string,
  row: ReportDbRow,
  step: StepNumber,
  deps: AdvanceDeps,
): Promise<AdvanceOutcome> {
  const reportId = row.id;
  const gate = chargeGate(row, step);

  // 선점 전에 막아야 거절된 요청이 시도 횟수를 올리지 않는다.
  if (gate === "check_access") {
    const config = SERVICE_CONFIGS.growth;
    if (!config) throw new Error("SERVICE_CONFIGS.growth 가 없습니다.");
    const { allowed, reason } = await hasPaidServiceAccess(db, userId, config);
    if (!allowed) return { kind: "no_entitlement", reason: reason ?? "none" };
  }
  if (gate === "refuse_closed") {
    return {
      kind: "claim_error",
      claim: { kind: "locked" },
      state: parseStepState(row.step_state),
      terminal: false,
    };
  }
  let lateCharged = false;
  if (gate === "late_charge") {
    const c = await consumeCredit(db, userId, reportId);
    if (!(c.charged || c.status === "already_charged"))
      return { kind: "no_entitlement", reason: c.status };
    lateCharged = true;
  }

  const claim = await claimStep(db, userId, reportId, step);
  if (claim.kind === "done")
    return { kind: "done", state: parseStepState(row.step_state) };
  if (claim.kind !== "claimed") {
    if (claim.kind === "exhausted")
      await terminateAndReverse(db, userId, reportId, step, "exhausted");
    return {
      kind: "claim_error",
      claim,
      state: parseStepState(row.step_state),
      terminal: claim.kind === "exhausted",
    };
  }

  // 모델 호출 기록은 어떤 경로로 끝나도 응답 직전에 한 번 내보낸다.
  const trace = createAiTrace({
    service: "growth",
    feature: "report_step",
    step: String(step),
    targetKind: "growth_report",
    targetId: reportId,
    profileId: userId,
  });

  // 이 아래에서 던지면 선점한 단계를 실패로 닫고 다시 던진다.
  try {
    let context: Awaited<ReturnType<typeof loadContextInputs>>;
    try {
      context = await loadContextInputs(db, userId, row, deps.now());
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
      return { kind: "context_error" };
    }

    const carried =
      step === 8
        ? await loadCarried(db, userId, await loadPreviousReportId(db, userId))
        : undefined;
    const result = await runStep(step, context, toStoredOutputs(row), {
      callModel: callModelWith(deps.callStructured, trace),
      now: deps.now,
      budgetMs: STEP_BUDGET_MS - (Date.now() - deps.startedAt),
      ...(carried !== undefined && { carried }),
    });

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
          return {
            kind: done.reason === "not_ready" ? "not_ready" : "superseded",
          };
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
        if (!finished) return { kind: "superseded" };
      }

      // No.14: 첫 모델 호출 단계(1단계) 성공 시 차감. 거절돼도 진행은 막지 않는다.
      let charged: boolean | undefined = lateCharged ? true : undefined;
      if (step === 1 && gate === "check_access") {
        try {
          const c = await consumeCredit(db, userId, reportId);
          charged = c.charged || c.status === "already_charged";
          if (!charged) console.warn("growth/report 차감 거절:", c.status);
        } catch (e) {
          console.error("growth/report 차감 실패:", e);
          charged = false;
        }
      }

      // No.111: 이번 요청이 완료시킨 경우에만 학부모에게 알린다. 실패는 결과에 영향이 없다.
      if (completion !== undefined && !alreadyCompleted) {
        // 8단계 요청 예산을 넘기지 않도록 5초까지만 기다린다. 늦는 발송은 버리지 않고
        // 계속 두되 결과는 기다리지 않는다.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const sending = notifyGrowthReportDone(db, userId, reportId);
          // 시간 제한에 걸려 race 가 먼저 끝난 뒤 발송이 실패하면 처리되지 않은 거부가
          // 되므로 미리 삼킨다. 실제 실패 로그는 notify 안에서 남긴다.
          sending.catch(() => {});
          const gave = await Promise.race([
            sending.then(() => false),
            new Promise<boolean>((resolve) => {
              timer = setTimeout(() => resolve(true), NOTIFY_WAIT_MS);
            }),
          ]);
          if (gave) {
            console.warn(
              `growth/report 완료 알림이 ${NOTIFY_WAIT_MS}ms 안에 끝나지 않아 기다리지 않아요.`,
            );
          }
        } catch (e) {
          console.error("growth/report 완료 알림 실패:", e);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      const state = await freshState(db, userId, row);
      if (alreadyCompleted) return { kind: "done", state };
      return {
        kind: "ok",
        state,
        ...(charged !== undefined && { charged }),
        ...(completion !== undefined && { completion }),
      };
    }

    const closed = await finishStep(
      db,
      userId,
      reportId,
      step,
      false,
      {},
      result.issues,
      result.extraAttempts,
    );
    // 다른 요청이 이 단계를 가져갔으면 그 요청이 결과를 정한다. 종결 판정을 하지 않는다.
    if (!closed) return { kind: "superseded" };
    const state = await freshState(db, userId, row);
    const terminal = shouldTerminate(state, step, result.failure);
    if (terminal)
      await terminateAndReverse(
        db,
        userId,
        reportId,
        step,
        result.failure === "fatal" ? "fatal" : "exhausted",
      );
    return {
      kind: "failure",
      failure: result.failure,
      issues: result.issues,
      state,
      terminal,
    };
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
  } finally {
    await trace.flush(db);
  }
}
