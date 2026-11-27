// api/selfeval 의 단계 핸들러(analyze, write, verify, finalize)가 함께 쓰는 응답 조립.
// 응답 코드 표는 runModelStep.outcomeToHttp 에 있고, 여기서는 그것을 HTTP 로 내보낸다.

import { ProblemError } from "../hono/problem.js";
import type { SessionRow } from "./rows.js";
import {
  type Outcome,
  outcomeToHttp,
  type SimpleOutcome,
} from "./runModelStep.js";

/**
 * 단계 결과를 응답 본문으로 바꾼다. 성공이면 본문(okBody, 모델 단계는 attempts 와 softIssues 를 더함)을 돌려주고,
 * 그 밖은 같은 상태, 코드, 문구, 확장 멤버의 ProblemError 를 던진다. ok 필드는 싣지 않는다.
 */
export function outcomeBody<T, B extends Record<string, unknown>>(
  outcome: Outcome<T> | SimpleOutcome<T>,
  okBody: (result: T) => B,
): B {
  if (outcome.kind === "done") return okBody(outcome.result);
  const http = outcomeToHttp(outcome);
  if (outcome.kind === "ok") {
    return { ...okBody(outcome.result), ...http.extra };
  }
  throw new ProblemError(http.status, http.message, http.code, http.extra);
}

/** 단계 조작을 받을 수 없는 세션이면 409 ProblemError 를 던진다. */
export function assertSessionOpen(
  session: Pick<SessionRow, "status">,
  allowCompleted: boolean,
): void {
  const closed = checkSessionOpen(session, allowCompleted);
  if (closed !== null) {
    throw new ProblemError(closed.status, closed.message, closed.code);
  }
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
