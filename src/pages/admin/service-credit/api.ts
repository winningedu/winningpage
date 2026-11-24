// 서비스이용횟수조정 화면의 서버 호출. 학생 검색은 shared/studentSearch.ts 를 쓰고,
// 현황 조회와 조정은 /api/admin/service-credit-summary, /api/admin/service-credit-adjust 를 부른다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";

const rowSchema = z.object({
  programKey: z.string(),
  label: z.string(),
  periodBased: z.boolean(),
  liveCount: z.number(),
  quotaTotal: z.number().nullable(),
  quotaUsed: z.number(),
  quotaRemaining: z.number().nullable(),
  expiresAt: z.string().nullable(),
});
export type ServiceCreditRow = z.infer<typeof rowSchema>;

const summarySchema = z.object({
  student: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  items: z.array(rowSchema),
});
export type ServiceCreditSummary = z.infer<typeof summarySchema>;

const adjustSchema = z.object({ credit: rowSchema });

export type AdjustBody = {
  profileId: string;
  programKey: string;
  delta: number;
  months?: number;
  reason: string;
};

export const serviceCreditKeys = {
  all: ["admin", "service-credit"] as const,
  summary: (profileId: string) =>
    [...serviceCreditKeys.all, "summary", profileId] as const,
};

export function serviceCreditSummaryQueryOptions(profileId: string) {
  return queryOptions({
    queryKey: serviceCreditKeys.summary(profileId),
    queryFn: ({ signal }) =>
      api
        .get("admin/service-credit-summary", {
          searchParams: { profileId },
          signal,
        })
        .json(summarySchema),
  });
}

export async function postServiceCreditAdjust(body: AdjustBody) {
  const result = await api
    .post("admin/service-credit-adjust", { json: body })
    .json(adjustSchema);
  return result.credit;
}
