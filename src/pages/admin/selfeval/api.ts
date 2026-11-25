// 자기평가서 세션 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.
// 학생 검색은 shared/studentSearch.ts 를 쓴다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type SelfevalSessionsQuery,
  selfevalSessionsRequestParams,
} from "./query";
import type { SelfevalSessionDetail, SelfevalSessionItem } from "./row";

const terminalSchema = z
  .object({ reason: z.string(), at: z.string(), step: z.string().nullable() })
  .nullable();

const progressSchema = z.array(
  z.object({
    step: z.string(),
    label: z.string(),
    status: z.string(),
    attempts: z.number(),
  }),
);

const itemSchema: z.ZodType<SelfevalSessionItem> = z.object({
  id: z.string(),
  profileId: z.string(),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  currentStep: z.number(),
  academicYear: z.number().nullable(),
  semester: z.number().nullable(),
  area: z.string().nullable(),
  subject: z.string().nullable(),
  activityName: z.string().nullable(),
  regenerateCount: z.number(),
  ledgerId: z.string().nullable(),
  ledgerReversedAt: z.string().nullable(),
  terminal: terminalSchema,
  progress: progressSchema,
  lastActivityAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

const pageSchema = z.object({
  items: z.array(itemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SelfevalSessionsPage = z.infer<typeof pageSchema>;

const detailSchema: z.ZodType<SelfevalSessionDetail> = z.object({
  // DB 행 그대로라 화면이 읽는 컬럼만 검증하고 나머지는 통과시킨다.
  session: z.looseObject({
    id: z.string(),
    status: z.string(),
    current_step: z.number(),
    ledger_id: z.string().nullable(),
    ledger_reversed_at: z.string().nullable(),
  }),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  terminal: terminalSchema,
  progress: progressSchema,
  activities: z.array(
    z.object({
      activityRecordId: z.string(),
      role: z.string(),
      fitScore: z.number().nullable(),
      analysisSource: z.string().nullable(),
    }),
  ),
  reports: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      revision: z.number(),
      score: z.number().nullable(),
      createdAt: z.string(),
    }),
  ),
});

const grantSchema = z.object({ grantId: z.string(), quota: z.unknown() });
const recoverSchema = z.object({ newSessionId: z.string() });

export const selfevalKeys = {
  all: ["admin", "selfeval-sessions"] as const,
  lists: () => [...selfevalKeys.all, "list"] as const,
  list: (query: SelfevalSessionsQuery) =>
    [...selfevalKeys.lists(), query] as const,
  detail: (id: string) => [...selfevalKeys.all, "detail", id] as const,
};

const one = (id: string) => `admin/selfeval-sessions/${encodeURIComponent(id)}`;

export function selfevalListQueryOptions(query: SelfevalSessionsQuery) {
  return queryOptions({
    queryKey: selfevalKeys.list(query),
    queryFn: ({ signal }) =>
      api
        .get("admin/selfeval-sessions", {
          searchParams: selfevalSessionsRequestParams(query),
          signal,
        })
        .json(pageSchema),
  });
}

export function selfevalDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: selfevalKeys.detail(id),
    queryFn: ({ signal }) => api.get(one(id), { signal }).json(detailSchema),
  });
}

export function postSelfevalGrant(body: unknown) {
  return api.post("admin/selfeval-grant", { json: body }).json(grantSchema);
}

export function postSelfevalRecover(sessionId: string) {
  return api
    .post("admin/selfeval-recover", { json: { sessionId } })
    .json(recoverSchema);
}
