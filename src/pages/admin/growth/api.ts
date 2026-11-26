// 성장설계 회차 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import {
  growthReport,
  growthReportsPage,
} from "../../../../shared/growth-report/contract.js";
import type { buildGrantBody } from "./grantForm";
import type { GrowthReportsParams } from "./query";

const grantSchema = z.object({ grantId: z.string(), quota: z.unknown() });
const recoverSchema = z.object({ newReportId: z.string() });

export const growthReportKeys = {
  all: ["admin", "growthReports"] as const,
  list: (params: GrowthReportsParams) =>
    [...growthReportKeys.all, "list", params] as const,
  detail: (id: string) => [...growthReportKeys.all, "detail", id] as const,
};

export function fetchGrowthReports(
  params: GrowthReportsParams,
  signal?: AbortSignal,
) {
  return api
    .get("admin/growth-reports", {
      searchParams: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.q ? { q: params.q } : {}),
        page: params.page,
        pageSize: params.pageSize,
      },
      ...(signal ? { signal } : {}),
    })
    .json(growthReportsPage);
}

export function fetchGrowthReport(id: string, signal?: AbortSignal) {
  return api
    .get(
      `admin/growth-reports/${encodeURIComponent(id)}`,
      signal ? { signal } : {},
    )
    .json(growthReport);
}

export function postGrowthGrant(body: ReturnType<typeof buildGrantBody>) {
  return api.post("admin/growth-grant", { json: body }).json(grantSchema);
}

export function postGrowthRecover(reportId: string) {
  return api
    .post("admin/growth-recover", { json: { reportId } })
    .json(recoverSchema);
}

/** 서버가 준 problem detail 을 그대로 보여주고, 응답을 읽지 못한 실패만 일반 문구로 대신한다. */
export function growthErrorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : "요청에 실패했습니다.";
}
