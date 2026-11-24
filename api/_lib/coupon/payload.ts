// 쿠폰 등록과 수정 본문. 범위 규칙은 두지 않는다: DB CHECK 가 업무 규칙이고 위반은 saveError.ts 가 422 로 바꾼다.

import type { VercelResponse } from "@vercel/node";
import { z } from "zod";
import { parseInput } from "./parseInput.js";

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

export function parseCouponPayload(
  res: VercelResponse,
  body: unknown,
): CouponPayload | null {
  return parseInput(res, couponPayloadSchema, body);
}
