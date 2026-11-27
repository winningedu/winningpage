// 매출 화면 환불 대기 건수 API 계약(GET /api/admin/revenue/pending). 서버(api/_routes/admin/revenue-pending.ts)가 이 모양으로 돌려주고,
// 브라우저(src/pages/admin/revenue/api.ts)가 응답 스키마로 검증한다.

import { z } from "zod";

/** approvalWaiting 은 승인 전, processWaiting 은 승인됐지만 실제 환불이 끝나지 않은 건이다. */
export const revenuePendingSchema = z.object({
  approvalWaiting: z.number(),
  processWaiting: z.number(),
});

export type RevenuePending = z.output<typeof revenuePendingSchema>;
