// 계약 종료 회원 삭제와 삭제 로그의 서버 호출. 실패는 던져서 react-query 가 오류로 받는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";

// 기관 목록은 admin/tenants 응답에서 이 화면이 쓰는 열만 읽는다.
const contractTenantSchema = z.looseObject({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  contract_end_date: z.string().nullable(),
  time_zone: z.string(),
});

const tenantListSchema = z.object({ items: z.array(contractTenantSchema) });

const purgePreviewSchema = z.object({
  contractEnd: z.string().nullable(),
  graceEnd: z.string().nullable(),
  deletableFrom: z.string().nullable(),
  /** 삭제 가능일까지 남은 날. 0 이하면 지금 지울 수 있다. */
  dDay: z.number().nullable(),
  students: z.array(
    z.object({
      id: z.string(),
      /** 서버가 가린 이름이다("김*늘"). */
      name: z.string(),
      grade: z.string().nullable(),
      classLabel: z.string().nullable(),
      number: z.number().nullable(),
      protected: z.boolean(),
    }),
  ),
});

const purgeResultSchema = z.object({
  deleted: z.number(),
  excluded: z.number(),
  skipped: z.number(),
  notProcessed: z.number(),
});

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

export type ContractTenant = z.infer<typeof contractTenantSchema> & {
  contract_end_date: string;
};
export type PurgePreview = z.infer<typeof purgePreviewSchema>;
export type PurgeResult = z.infer<typeof purgeResultSchema>;
export type PurgeLogEntry = z.infer<typeof purgeLogEntrySchema>;

export function usePurgeLogs() {
  return useQuery({
    queryKey: ["admin", "purge-logs"],
    queryFn: ({ signal }) =>
      api.get("admin/tenants/purge-logs", { signal }).json(purgeLogsSchema),
  });
}

/** 계약 종료일이 있는 기관을 이름순으로 돌려준다. */
export function useContractTenants() {
  return useQuery({
    queryKey: ["admin", "member-purge", "tenants"],
    queryFn: ({ signal }) =>
      api.get("admin/tenants", { signal }).json(tenantListSchema),
    select: (data): ContractTenant[] =>
      data.items
        .flatMap((tenant) =>
          tenant.contract_end_date === null
            ? []
            : [{ ...tenant, contract_end_date: tenant.contract_end_date }],
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  });
}

export function usePurgePreview(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "member-purge", "preview", tenantId],
    queryFn: ({ signal }) =>
      api
        .get("admin/tenants/member-purge-preview", {
          searchParams: { tenantId: tenantId ?? "" },
          signal,
        })
        .json(purgePreviewSchema),
    enabled: Boolean(tenantId),
  });
}

export function useMemberPurge() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { tenantId: string; targetIds: string[] }) =>
      api
        .post("admin/tenants/member-purge", { json: body })
        .json(purgeResultSchema),
    // 지운 학생이 목록에서 빠지도록 미리보기를 다시 읽는다.
    onSettled: (_data, _error, body) =>
      client.invalidateQueries({
        queryKey: ["admin", "member-purge", "preview", body.tenantId],
      }),
  });
}
