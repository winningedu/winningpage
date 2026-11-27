// 목표관리 라우트의 실패 응답. 예전 라우트가 내던 본문({ detail }, { reason }, { detail, reason, ... })을 problem(RFC 9457)으로 바꾼다.
// detail 은 그대로 problem detail 이 되고, reason 과 그 밖의 키(tenantReason 등)는 같은 이름의 확장 멤버로 남는다(화면이 reason 으로 가른다).
// code 는 reason 이 있으면 그 대문자, 미결제 403 은 NO_ENTITLEMENT, 나머지는 상태별 공통 코드다.

import type { Context } from "hono";
import { GOAL_ERROR } from "../../../shared/goal/contract.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { problemResponse } from "../hono/problem.js";
import { PAID_MESSAGE } from "./repo.js";

const STATUS_CODE: Record<number, string> = {
  400: PROBLEM_CODE.VALIDATION_FAILED,
  401: PROBLEM_CODE.UNAUTHENTICATED,
  403: PROBLEM_CODE.FORBIDDEN,
  404: PROBLEM_CODE.NOT_FOUND,
  409: PROBLEM_CODE.CONFLICT,
  500: PROBLEM_CODE.INTERNAL_ERROR,
};

// 예전 본문이 reason 만 싣던 실패의 서버 문구. 화면은 reason 으로 자기 문구를 고른다.
const REASON_MESSAGE: Record<string, string> = {
  before_start_date: "목표 시작일 전에는 기록할 수 없어요.",
  no_study_time: "공부 시간을 입력해 주세요.",
  not_onboarded: "목표 설정을 먼저 마쳐 주세요.",
  awaiting_cuts: "목표 대학 컷을 기다리는 중이에요.",
};

const FALLBACK_MESSAGE = "요청을 처리하지 못했어요.";

export function goalFail(
  c: Context,
  status: number,
  body: Record<string, unknown>,
): Response {
  const { detail, reason, ...extra } = body;
  const code =
    typeof reason === "string"
      ? reason.toUpperCase()
      : status === 403 && detail === PAID_MESSAGE
        ? GOAL_ERROR.NO_ENTITLEMENT
        : (STATUS_CODE[status] ?? PROBLEM_CODE.INTERNAL_ERROR);
  const message =
    typeof detail === "string"
      ? detail
      : ((typeof reason === "string" ? REASON_MESSAGE[reason] : undefined) ??
        FALLBACK_MESSAGE);
  return problemResponse(c, status, message, code, {
    ...extra,
    ...(typeof reason === "string" ? { reason } : {}),
  });
}
