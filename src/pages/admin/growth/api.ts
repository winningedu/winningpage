// 성장설계 회차 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import {
  type GrowthGrantInput,
  growthGrantResultSchema,
  growthRecoverResultSchema,
} from "../../../../shared/growth-ops/contract.js";
import type { GrowthReportsParams } from "./query";
import type { GrowthReportItem } from "./row";

const growthReportSchema: z.ZodType<GrowthReportItem> = z.object({
  id: z.string(),
  profileId: z.string(),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  currentStep: z.number(),
  track: z.string().nullable(),
  issuedAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  ledgerId: z.string().nullable(),
  ledgerReversedAt: z.string().nullable(),
  terminal: z
    .object({ reason: z.string(), at: z.string(), step: z.number() })
    .nullable(),
  progress: z.array(
    z.object({
      step: z.number(),
      label: z.string(),
      status: z.string(),
      attempts: z.number(),
    }),
  ),
});

const growthReportsPageSchema = z.object({
  items: z.array(growthReportSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

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
    .json(growthReportsPageSchema);
}

export function fetchGrowthReport(id: string, signal?: AbortSignal) {
  return api
    .get(
      `admin/growth-reports/${encodeURIComponent(id)}`,
      signal ? { signal } : {},
    )
    .json(growthReportSchema);
}

export function postGrowthGrant(body: GrowthGrantInput) {
  return api
    .post("admin/growth-grant", { json: body })
    .json(growthGrantResultSchema);
}

export function postGrowthRecover(reportId: string) {
  return api
    .post("admin/growth-recover", { json: { reportId } })
    .json(growthRecoverResultSchema);
}

/** 서버가 준 problem detail 을 그대로 보여주고, 응답을 읽지 못한 실패만 일반 문구로 대신한다. */
export function growthErrorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : "요청에 실패했습니다.";
}
