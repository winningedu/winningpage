// 계약 종료 회원 삭제와 삭제 로그의 서버 호출. 실패는 던져서 react-query 가 오류로 받는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type PurgeLogEntry,
  type PurgePreview,
  type PurgeResult,
  purgeLogsSchema,
  purgePreviewSchema,
  purgeResultSchema,
} from "../../../../shared/tenant/contract.js";

// 기관 목록은 admin/tenants 응답에서 이 화면이 쓰는 열만 읽는다.
const contractTenantSchema = z.looseObject({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  contract_end_date: z.string().nullable(),
  time_zone: z.string(),
});

const tenantListSchema = z.object({ items: z.array(contractTenantSchema) });

export type ContractTenant = z.infer<typeof contractTenantSchema> & {
  contract_end_date: string;
};
export type { PurgeLogEntry, PurgePreview, PurgeResult };

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
    // 지운 학생이 목록에서 빠지도록 미리보기를 비우고 스켈레톤 뒤에 다시 읽는다.
    onSettled: (_data, _error, body) =>
      client.resetQueries({
        queryKey: ["admin", "member-purge", "preview", body.tenantId],
      }),
  });
}
