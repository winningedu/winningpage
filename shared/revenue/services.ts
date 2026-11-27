// 매출 화면 서비스 탭 API 계약(GET /api/admin/revenue/services). 서버(api/_routes/admin/revenue-services.ts)가 이 모양으로 돌려주고,
// 브라우저(src/pages/admin/revenue/api.ts)가 응답 스키마로 검증한다.

import { z } from "zod";

/** 활성 상품의 service_key 를 중복 없이 { key, label } 로 준다. */
export const revenueServicesSchema = z.object({
  items: z.array(z.object({ key: z.string(), label: z.string() })),
});

export type RevenueServices = z.output<typeof revenueServicesSchema>;
export type RevenueServiceTab = RevenueServices["items"][number];
