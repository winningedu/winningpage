// 쿠폰 rpc 가 던지는 SQLSTATE 를 problem 응답으로 바꾼다. 매핑에 없는 오류는 던져서 500 으로 응답하게 한다.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";

export type RpcErrorMap = Record<
  string,
  { status: number; code: string; message: string }
>;

// 함수가 is_admin() 을 확인하다 거부할 때.
const FORBIDDEN = {
  "42501": { status: 403, code: "FORBIDDEN", message: "관리자 권한이 없어요." },
};

export const VOID_ERRORS: RpcErrorMap = {
  ...FORBIDDEN,
  WC002: {
    status: 409,
    code: "REDEMPTION_ALREADY_VOIDED",
    message: "이미 취소된 사용 이력이에요.",
  },
};

export const GRANT_ERRORS: RpcErrorMap = {
  ...FORBIDDEN,
  WC004: {
    status: 422,
    code: "COUPON_NOT_GRANTABLE",
    message: "발급할 수 없는 쿠폰이에요.",
  },
  WC005: {
    status: 409,
    code: "COUPON_ALREADY_REDEEMED",
    message: "이미 사용한 사용자라 다시 발급할 수 없어요.",
  },
  P0002: {
    status: 404,
    code: "PROFILE_NOT_FOUND",
    message: "사용자를 찾을 수 없어요.",
  },
};

export const REVOKE_ERRORS: RpcErrorMap = {
  ...FORBIDDEN,
  WC003: {
    status: 409,
    code: "GRANT_ALREADY_REVOKED",
    message: "이미 회수된 발급이에요.",
  },
};

export function sendRpcError(
  res: VercelResponse,
  error: { code?: string },
  map: RpcErrorMap,
): void {
  const mapped = error.code ? map[error.code] : undefined;
  if (!mapped) throw new Error("coupon rpc failed");
  sendError(res, "problem", mapped.status, mapped.message, mapped.code);
}
