// 쿠폰 등록과 수정 본문. 범위 규칙은 두지 않는다: DB CHECK 가 업무 규칙이고 위반은 saveError.ts 가 422 로 바꾼다.

import type { VercelResponse } from "@vercel/node";
import { z } from "zod";
import { sendError } from "../httpResponse.js";

export const couponPayloadSchema = z.strictObject({
  slug: z.string().trim().min(1),
  code: z.string().trim().min(1).nullable(),
  tenant_id: z.uuid().nullable(),
  title: z.string().trim().min(1),
  discount_amount: z.int(),
  min_amount: z.int(),
  is_active: z.boolean(),
  stackable: z.boolean(),
  grant_type: z.enum(["auto", "granted"]),
  grant_on_signup: z.boolean(),
  // 컬럼이 date 라 날짜만 받는다.
  valid_until: z.iso.date().nullable(),
  max_uses_per_user: z.int().nullable(),
  max_redemptions: z.int().nullable(),
});

export type CouponPayload = z.output<typeof couponPayloadSchema>;

/**
 * 한 파일이 GET 과 POST 를 함께 받으면 defineHandler 의 body 옵션을 쓸 수 없어(GET 에는 본문이 없다) 핸들러 안에서 검증한다.
 * 실패 바디는 defineHandler 의 검증 실패와 같은 모양(400 VALIDATION_FAILED, errors)이다.
 */
export function parseCouponPayload(
  res: VercelResponse,
  body: unknown,
): CouponPayload | null {
  const parsed = couponPayloadSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  sendError(
    res,
    "problem",
    400,
    "요청 값이 올바르지 않아요.",
    "VALIDATION_FAILED",
    {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  );
  return null;
}
