// 계약 종료 회원 삭제와 삭제 로그의 서버 호출. 실패는 던져서 react-query 가 오류로 받는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/client";
import {
  type TenantRow,
  tenantListSchema,
} from "../../../../shared/tenants/contract.js";
import {
  type PurgeLogEntry,
  type PurgePreview,
  type PurgeResult,
  purgeLogsSchema,
  purgePreviewSchema,
  purgeResultSchema,
} from "../../../../shared/tenants/purge.js";

/** 계약 종료일과 시간대가 있는 기관. 두 열은 스쿨멘토(hqTenantAdmin) 응답에만 있어 계약에서는 선택이다. */
export type ContractTenant = TenantRow & {
  contract_end_date: string;
  time_zone: string;
};
export type { PurgeLogEntry, PurgeResult };

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
          typeof tenant.contract_end_date === "string" &&
          typeof tenant.time_zone === "string"
            ? [
                {
                  ...tenant,
                  contract_end_date: tenant.contract_end_date,
                  time_zone: tenant.time_zone,
                },
              ]
            : [],
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
