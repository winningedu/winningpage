// 기관 API 계약(루트 경로 GET, POST /api/admin/tenants). 서버(api/_routes/admin/tenants.ts)가 요청 스키마로 검증하고, 브라우저(기관 관리 화면)가 응답 스키마로 검증한다.

import { z } from "zod";

/** 최고 관리자가 아닌 사람이 기관을 등록하려 할 때의 403 코드. */
export const TENANT_PROBLEM_CODE = {
  NOT_SUPER_ADMIN: "NOT_SUPER_ADMIN",
} as const;

/** POST 본문. 등록 화면이 만드는 네 칸만 받는다. 그 밖의 키는 400 이다. */
export const createTenantBody = z.strictObject({
  name: z.string().trim().min(1),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
});

/** 브라우저가 보내는 모양. */
export type CreateTenantInput = z.input<typeof createTenantBody>;

const nullableText = z.string().nullable();

export const tenantRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
  created_at: z.string(),
  // 아래 열은 스쿨멘토(hqTenantAdmin)에서만 온다.
  contract_start_date: nullableText.optional(),
  contract_end_date: nullableText.optional(),
  grace_ends_on: nullableText.optional(),
  mou_status: nullableText.optional(),
  is_catch_all: z.boolean().optional(),
  time_zone: z.string().optional(),
});

export type TenantRow = z.output<typeof tenantRowSchema>;

/** GET 응답. graceDays 는 hqTenantAdmin 사이트에서만 읽고, 아니면 null 이다. */
export const tenantListSchema = z.object({
  items: z.array(tenantRowSchema),
  graceDays: z.number().nullable(),
});

export type TenantList = z.output<typeof tenantListSchema>;
