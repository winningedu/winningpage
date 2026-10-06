import { queryOptions } from "@tanstack/react-query";
import { fetchChildReportDetail, fetchChildReports } from "@/lib/growth/api";
import { GrowthApiError } from "@/lib/growth/queries";

// 학부모 열람 쿼리. queryKey 에 학부모 userId 와 childId 를 모두 넣는다(계정 전환 시 캐시 오염 방지).
// 서버가 연결 여부를 다시 확인하므로(403 NOT_LINKED) 실패는 GrowthApiError 로 던져 화면이 분기한다.

export function childReportsQuery(
  userId: string | null,
  childId: string | undefined,
) {
  return queryOptions({
    queryKey: ["growth", "child-reports", userId, childId ?? null] as const,
    queryFn: async () => {
      const result = await fetchChildReports(childId ?? "");
      if (result.kind === "ok") return result.data;
      throw new GrowthApiError(result);
    },
    enabled: !!userId && !!childId,
    staleTime: 15_000,
    retry: 0,
  });
}

export function childReportDetailQuery(
  userId: string | null,
  childId: string | undefined,
  reportId: string | undefined,
) {
  return queryOptions({
    queryKey: [
      "growth",
      "child-report-detail",
      userId,
      childId ?? null,
      reportId ?? null,
    ] as const,
    queryFn: async () => {
      const result = await fetchChildReportDetail(
        childId ?? "",
        reportId ?? "",
      );
      if (result.kind === "ok") return result.data;
      throw new GrowthApiError(result);
    },
    enabled: !!userId && !!childId && !!reportId,
    staleTime: 15_000,
    retry: 0,
  });
}

/** 서버가 연결되지 않은 자녀로 판정했는지. */
export function isNotLinked(error: unknown): boolean {
  return (
    error instanceof GrowthApiError &&
    error.result.kind === "error" &&
    error.result.status === 403
  );
}

export function isNotFound(error: unknown): boolean {
  return (
    error instanceof GrowthApiError &&
    error.result.kind === "error" &&
    error.result.status === 404
  );
}
