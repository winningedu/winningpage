// 소속 선택지 API 계약. 서버(api/_routes/admin/tenant-options.ts)가 이 모양으로 돌려주고, 브라우저(회원 화면, 배너 폼)가 응답 스키마로 검증한다.

import { z } from "zod";

export const tenantOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  org_type: z.string().nullable(),
  is_catch_all: z.boolean(),
});

/** GET /api/admin/tenant-options 응답. 이름순이다. */
export const tenantOptionsSchema = z.object({
  items: z.array(tenantOptionSchema),
});

export type TenantOption = z.output<typeof tenantOptionSchema>;
export type TenantOptions = z.output<typeof tenantOptionsSchema>;
