// 쿠폰 저장 중 DB 제약 위반을 problem 오류로 바꾼다.

import { COUPON_ERROR } from "../../../shared/coupon/contract.js";
import { ProblemError } from "../hono/problem.js";

// 상한 열이 grant_type 에서 파생되는 제약. 다른 CHECK 와 안내 문구가 달라 따로 구분한다.
const CAP_CONSTRAINT = "coupons_cap_derived_from_grant_type_check";

/** 알려진 제약 위반은 409, 422 problem 을, 그 밖은 일반 예외를 던져 500 이 되게 한다. */
export function throwCouponSaveError(error: {
  code?: string;
  message?: string;
}): never {
  if (error.code === "23505") {
    throw new ProblemError(
      409,
      "이미 같은 슬러그나 코드의 쿠폰이 있어요.",
      COUPON_ERROR.COUPON_DUPLICATE,
    );
  }
  if (error.code === "23514") {
    const capMismatch = (error.message ?? "").includes(CAP_CONSTRAINT);
    throw new ProblemError(
      422,
      capMismatch
        ? "쿠폰 종류와 사용 한도 조합이 맞지 않아요."
        : "쿠폰 값이 허용 범위를 벗어났어요.",
      capMismatch
        ? COUPON_ERROR.COUPON_CAP_MISMATCH
        : COUPON_ERROR.COUPON_CHECK_FAILED,
    );
  }
  throw new Error("coupon save failed");
}
