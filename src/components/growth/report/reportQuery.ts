import { queryOptions } from "@tanstack/react-query";
import { fetchReportDetail } from "@/lib/growth/api";
import { GrowthApiError } from "@/lib/growth/queries";

/** 리포트 상세 조회. queryKey 에 userId 와 reportId 를 넣는다(계정 전환 시 캐시 오염 방지). */
export function growthReportDetailQuery(
  userId: string | null,
  reportId: string | undefined,
) {
  return queryOptions({
    queryKey: ["growth", "report-detail", userId, reportId ?? null] as const,
    queryFn: async () => {
      // reportId 없는 상태는 enabled 로 막힌다.
      const result = await fetchReportDetail(reportId ?? "");
      if (result.kind === "ok") return result.data;
      throw new GrowthApiError(result);
    },
    enabled: !!userId && !!reportId,
    staleTime: 15_000,
    retry: 0,
  });
}
