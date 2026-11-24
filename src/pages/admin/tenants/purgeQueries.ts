// 계약 종료 회원 삭제와 삭제 로그의 서버 호출. 실패는 던져서 react-query 가 오류로 받는다.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";

const purgeLogEntrySchema = z.object({
  id: z.string(),
  executedAt: z.string(),
  executedBy: z.string().nullable(),
  tenant: z
    .object({ id: z.string().nullable(), code: z.string(), name: z.string() })
    .nullable(),
  contractEndDate: z.string().nullable(),
  deletedCount: z.number(),
  excludedCount: z.number(),
  skippedCount: z.number(),
  memberIds: z.array(z.string()),
});

const purgeLogsSchema = z.object({ items: z.array(purgeLogEntrySchema) });

export type PurgeLogEntry = z.infer<typeof purgeLogEntrySchema>;

export function usePurgeLogs() {
  return useQuery({
    queryKey: ["admin", "purge-logs"],
    queryFn: ({ signal }) =>
      api.get("admin/tenants/purge-logs", { signal }).json(purgeLogsSchema),
  });
}
