// 매출 및 결제 화면의 데이터 호출. 브라우저에서 supabase 를 직접 읽지 않고 /api/admin/revenue 로만 읽는다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type RevenueQueryInput,
  type RevenueRow,
  revenueResponseSchema,
} from "../../../../shared/revenue/contract.js";

export type { RevenueRow };

const serviceTabsResponseSchema = z.object({
  items: z.array(z.object({ key: z.string(), label: z.string() })),
});

const pendingSchema = z.object({
  approvalWaiting: z.number(),
  processWaiting: z.number(),
});

export type ServiceTab = z.infer<
  typeof serviceTabsResponseSchema
>["items"][number];

const revenueKey = ["admin", "revenue"] as const;
export const revenueRowsKey = [...revenueKey, "rows"] as const;

/** from 포함, to 미포함인 UTC 순간(ISO Z)으로 기간 안의 행을 받는다. */
export function revenueRowsQuery(from: string, to: string) {
  return queryOptions({
    queryKey: [...revenueRowsKey, from, to],
    // 기간 키를 바꾸거나 화면에 다시 들어올 때 지난 행을 먼저 보이지 않는다.
    gcTime: 0,
    queryFn: async ({ signal }) =>
      (
        await api
          .get("admin/revenue", {
            searchParams: { from, to } satisfies RevenueQueryInput,
            signal,
          })
          .json(revenueResponseSchema)
      ).items,
  });
}

export const revenueServicesQuery = queryOptions({
  queryKey: [...revenueKey, "services"],
  queryFn: async ({ signal }) =>
    (
      await api
        .get("admin/revenue/services", { signal })
        .json(serviceTabsResponseSchema)
    ).items,
});

export const revenuePendingQuery = queryOptions({
  queryKey: [...revenueKey, "pending"],
  queryFn: ({ signal }) =>
    api.get("admin/revenue/pending", { signal }).json(pendingSchema),
});
