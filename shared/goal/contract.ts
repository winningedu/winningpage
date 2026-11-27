// 목표관리 학생, 학부모 라우트(/api/goal/*) 공통 계약. 관리자 라우트 계약은 admin-cuts.ts, admin-students.ts 다.
// 요청 본문은 라우트가 예전 그대로 직접 검사한다(400 문구를 지킨다). 그래서 본문 스키마는 JSON 이면 받는다.

import { z } from "zod";

/** JSON 본문. Content-Type 이 JSON 이 아니면 빈 객체로 검사한다(예전 req.body 없음과 같다). */
export const goalJsonBody = z.unknown();

/**
 * 실패 code. 예전 본문의 reason 이 있으면 그 대문자가 code 이고 reason 은 확장 멤버로도 남는다.
 * 미결제 쓰기는 403 NO_ENTITLEMENT(확장 멤버 tenantReason), 그 밖은 상태별 공통 코드(shared/http/codes.ts)다.
 */
export const GOAL_ERROR = {
  NO_ENTITLEMENT: "NO_ENTITLEMENT",
  NOT_ONBOARDED: "NOT_ONBOARDED",
  AWAITING_CUTS: "AWAITING_CUTS",
  ALREADY_ONBOARDED: "ALREADY_ONBOARDED",
  CUT_NOT_FOUND: "CUT_NOT_FOUND",
  RECORD_NOT_FOUND: "RECORD_NOT_FOUND",
  BEFORE_START_DATE: "BEFORE_START_DATE",
  NO_STUDY_TIME: "NO_STUDY_TIME",
  COOLDOWN: "COOLDOWN",
  NOT_LINKED: "NOT_LINKED",
} as const;
