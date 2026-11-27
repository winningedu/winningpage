// 이용권 회차 현황 응답. 관리자 이용권 부여(growth-grant, inquiry-grant, selfeval-grant)가 부여 직후 현황으로 돌려주고, 서버는 readQuotaSnapshot 이 만든다.
// 이용권 행이 없거나 합계를 못 읽으면 전부 null(정보 없음)이다. null 을 0 으로 내리면 무제한 사용자가 소진으로 보인다.

import { z } from "zod";

export const quotaSnapshotSchema = z.object({
  quotaTotal: z.number().nullable(),
  quotaUsed: z.number().nullable(),
  quotaRemaining: z.number().nullable(),
  planEndsAt: z.string().nullable(),
  planLabel: z.string().nullable(),
});

export type QuotaSnapshot = z.output<typeof quotaSnapshotSchema>;
