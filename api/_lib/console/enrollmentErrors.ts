// 학적 RPC(WC077 에서 WC087, 외래키 23503)의 에러를 코드가 붙은 HTTP 에러로 바꾼다.
// 코드는 supabase/migrations 의 b2b_student_enrollments, b2b_enrollment_change_requests,
// b2b_school_year_rollover 가 정한다.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";

interface Mapped {
  status: number;
  code: string;
  message: string;
}

const MAPPED: Record<string, Mapped> = {
  WC077: {
    status: 409,
    code: "NUMBER_TAKEN",
    message: "이미 사용 중인 번호예요.",
  },
  WC078: {
    status: 409,
    code: "VERSION_CONFLICT",
    message: "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
  },
  WC079: {
    status: 409,
    code: "ALREADY_ASSIGNED",
    message: "이미 학급이 정해져 있어요.",
  },
  WC080: {
    status: 400,
    code: "GROUP_NOT_REGISTERED",
    message: "등록되지 않은 학년그룹이에요.",
  },
  WC081: { status: 404, code: "NOT_FOUND", message: "학적을 찾을 수 없어요." },
  WC082: {
    status: 409,
    code: "REQUEST_PENDING",
    message: "이미 처리 중인 변경 신청이 있어요.",
  },
  WC083: {
    status: 404,
    code: "REQUEST_NOT_FOUND",
    message: "신청을 찾을 수 없거나 이미 처리됐어요.",
  },
  WC084: {
    status: 403,
    code: "NOT_APPROVER",
    message: "이 신청을 처리할 권한이 없어요.",
  },
  WC085: {
    status: 400,
    code: "REJECT_REASON_REQUIRED",
    message: "거절 사유를 입력해 주세요.",
  },
  WC086: {
    status: 409,
    code: "GROUP_HAS_STUDENTS",
    message: "재학생이 있는 학년그룹은 삭제할 수 없어요.",
  },
  WC087: {
    status: 404,
    code: "NOT_FOUND",
    message: "학년그룹을 찾을 수 없어요.",
  },
  "23503": {
    status: 400,
    code: "INVALID_CLASS",
    message: "학년, 학급 정보를 확인해 주세요.",
  },
};

/** 알려진 코드면 응답을 보내고 true. 아니면 false 라서 호출부가 예외로 던진다. */
export function sendEnrollmentRpcError(
  res: VercelResponse,
  error: { code?: string } | null | undefined,
): boolean {
  const mapped = error?.code ? MAPPED[error.code] : undefined;
  if (!mapped) return false;
  sendError(res, "coded", mapped.status, mapped.message, mapped.code);
  return true;
}
