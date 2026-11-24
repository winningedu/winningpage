// 쿠폰 저장 중 DB 제약 위반을 problem 응답으로 바꾼다.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";

// 상한 열이 grant_type 에서 파생되는 제약. 다른 CHECK 와 안내 문구가 달라 따로 구분한다.
const CAP_CONSTRAINT = "coupons_cap_derived_from_grant_type_check";

/** 알려진 제약 위반이면 응답을 보내고, 아니면 던져서 defineHandler 가 500 으로 응답하게 한다. */
export function sendCouponSaveError(
  res: VercelResponse,
  error: { code?: string; message?: string },
): void {
  if (error.code === "23505") {
    sendError(
      res,
      "problem",
      409,
      "이미 같은 슬러그나 코드의 쿠폰이 있어요.",
      "COUPON_DUPLICATE",
    );
    return;
  }
  if (error.code === "23514") {
    const capMismatch = (error.message ?? "").includes(CAP_CONSTRAINT);
    sendError(
      res,
      "problem",
      422,
      capMismatch
        ? "쿠폰 종류와 사용 한도 조합이 맞지 않아요."
        : "쿠폰 값이 허용 범위를 벗어났어요.",
      capMismatch ? "COUPON_CAP_MISMATCH" : "COUPON_CHECK_FAILED",
    );
    return;
  }
  throw new Error("coupon save failed");
}
