// 서비스이용횟수조정 화면의 서버 호출. 학생 검색은 shared/studentSearch.ts 를 쓰고,
// 현황 조회와 조정은 /api/admin/service-credit-summary, /api/admin/service-credit-adjust 를 부른다.
// 요청 타입과 응답 스키마는 서버와 같은 계약(shared/service-credit/contract.ts)을 쓴다.

import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/http/client";
import {
  type AdjustInput,
  adjustResultSchema,
  serviceCreditSummarySchema,
} from "../../../../shared/service-credit/contract.js";

export type {
  AdjustInput,
  ServiceCreditRow,
  ServiceCreditSummary,
} from "../../../../shared/service-credit/contract.js";

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
        .json(serviceCreditSummarySchema),
  });
}

export async function postServiceCreditAdjust(body: AdjustInput) {
  const result = await api
    .post("admin/service-credit-adjust", { json: body })
    .json(adjustResultSchema);
  return result.credit;
}
