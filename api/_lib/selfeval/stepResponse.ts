// api/selfeval 의 단계 핸들러(analyze, write, verify, finalize)가 함께 쓰는 응답 조립.
// 응답 코드 표는 runModelStep.outcomeToHttp 에 있고, 여기서는 그것을 HTTP 로 내보낸다.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";
import type { SessionRow } from "./rows.js";
import {
  type Outcome,
  outcomeToHttp,
  type SimpleOutcome,
} from "./runModelStep.js";

/**
 * 성공이면 { ok: true, ...okBody(result) } 를 200 으로 보낸다. 모델 단계 성공에는 attempts 와
 * softIssues 가 함께 실린다. 그 밖은 { ok: false, code, message, ...extra } 로 보낸다.
 */
export function sendOutcome<T>(
  res: VercelResponse,
  outcome: Outcome<T> | SimpleOutcome<T>,
  okBody: (result: T) => Record<string, unknown>,
): void {
  if (outcome.kind === "done") {
    res.status(200).json({ ok: true, ...okBody(outcome.result) });
    return;
  }
  const http = outcomeToHttp(outcome);
  if (outcome.kind === "ok") {
    res
      .status(200)
      .json({ ok: true, ...okBody(outcome.result), ...http.extra });
    return;
  }
  sendError(res, "coded", http.status, http.message, http.code, {
    ok: false,
    ...http.extra,
  });
}

/** 단계 조작을 받을 수 있는 세션인가. 거절이면 응답 정보를, 통과면 null 을 돌려준다. */
export function checkSessionOpen(
  session: Pick<SessionRow, "status">,
  allowCompleted: boolean,
): { status: number; code: string; message: string } | null {
  if (session.status === "draft" || session.status === "in_progress") {
    return null;
  }
  if (session.status === "completed" && allowCompleted) return null;
  return {
    status: 409,
    code: "SESSION_NOT_OPEN",
    message: "이미 끝났거나 닫힌 자기평가서예요.",
  };
}
