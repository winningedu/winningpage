// 쿠폰 등록과 수정 본문. 범위 규칙은 두지 않는다: DB CHECK 가 업무 규칙이고 위반은 saveError.ts 가 422 로 바꾼다.

import type { VercelResponse } from "@vercel/node";
import { z } from "zod";
import { parseInput } from "./parseInput.js";

const couponFields = {
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
};

// coupons 의 나머지 컬럼(database.types.ts Row). 행 스냅샷을 그대로 보내도 조용히 버리고 쓰지 않는다.
// 이 밖의 키는 coupons 컬럼이 아니므로 strict 가 400 으로 막는다.
export const couponPayloadSchema = z
  .strictObject({
    ...couponFields,
    id: z.unknown().optional(),
    created_at: z.unknown().optional(),
    org_code: z.unknown().optional(),
  })
  // 소속 쿠폰은 조건형(auto)에만 얹는다. 발급형은 coupon_grants 로 대상을 따로 정한다(옛 화면 form.ts 와 같은 규칙).
  .refine((v) => !(v.tenant_id !== null && v.grant_type === "granted"), {
    path: ["tenant_id"],
    message: "소속 쿠폰은 조건형만 쓸 수 있어요.",
  })
  .transform(
    ({ id: _id, created_at: _createdAt, org_code: _orgCode, ...rest }) => rest,
  );

export type CouponPayload = z.output<typeof couponPayloadSchema>;

export function parseCouponPayload(
  res: VercelResponse,
  body: unknown,
): CouponPayload | null {
  return parseInput(res, couponPayloadSchema, body);
}
