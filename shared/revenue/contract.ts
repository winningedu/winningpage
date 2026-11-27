// 매출 API 계약(루트 경로 GET /api/admin/revenue). 서버(api/_routes/admin/revenue.ts)가 요청 스키마로 검증하고, 브라우저(매출 및 결제 화면)가 응답 스키마로 검증한다.

import { z } from "zod";

/** GET 쿼리. from 포함, to 미포함인 ISO Z 시각이고 from 이 to 보다 앞이어야 한다. */
export const revenueQuery = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine((value) => Date.parse(value.from) < Date.parse(value.to), {
    message: "from 은 to 보다 앞이어야 합니다.",
    path: ["from"],
  });

/** 브라우저가 보내는 모양. */
export type RevenueQueryInput = z.input<typeof revenueQuery>;

// admin_revenue_items 뷰 한 줄. order_item_id 는 bigint 라 JSON 숫자로 온다.
export const revenueRowSchema = z.object({
  order_item_id: z.number(),
  order_id: z.string(),
  paid_at: z.string().nullable(),
  payer_name: z.string().nullable(),
  payer_email: z.string().nullable(),
  student_name: z.string().nullable(),
  service_key: z.string().nullable(),
  item_name: z.string().nullable(),
  list_amount: z.number().nullable(),
  discount_amount: z.number().nullable(),
  paid_amount: z.number().nullable(),
  refunded_amount: z.number().nullable(),
  revenue_status: z.string(),
  net_amount: z.number().nullable(),
});

export type RevenueRow = z.output<typeof revenueRowSchema>;

export const revenueResponseSchema = z.object({
  items: z.array(revenueRowSchema),
});

export type RevenueResponse = z.output<typeof revenueResponseSchema>;
