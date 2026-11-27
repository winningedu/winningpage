// 자기평가서 세션 운영 조회 API 계약(GET /api/admin/selfeval-sessions, /:id). 서버(api/_routes/admin/selfeval-sessions.ts)는
// 요청 스키마로 검증하고, 브라우저(src/pages/admin/selfeval/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

/** 서버가 내는 도메인 problem code. 목록 쿼리의 값 규칙과 한국어 사유는 서버 parseSessionsQuery 가 맡는다. */
export const SELFEVAL_SESSION_ERROR = {
  INVALID_QUERY: "INVALID_QUERY",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
} as const;

const queryValue = z.union([z.string(), z.array(z.string())]).optional();

/** GET ?status=&q=&page=&pageSize=. 여기서는 모양만 거른다. */
export const sessionListQuery = z.object({
  status: queryValue,
  q: queryValue,
  page: queryValue,
  pageSize: queryValue,
});

/** GET /:id 경로. */
export const sessionIdParams = z.object({ id: uuidId });

const terminal = z
  .object({ reason: z.string(), at: z.string(), step: z.string().nullable() })
  .nullable();

const progress = z.array(
  z.object({
    step: z.string(),
    label: z.string(),
    status: z.string(),
    attempts: z.number(),
  }),
);

/** 목록 항목. */
export const selfevalSessionItem = z.object({
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
  terminal,
  progress,
  // selfeval_sessions.last_activity_at 은 not null 이다.
  lastActivityAt: z.string(),
  completedAt: z.string().nullable(),
});
export type SelfevalSessionItem = z.output<typeof selfevalSessionItem>;

export const selfevalSessionsPage = z.object({
  items: z.array(selfevalSessionItem),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SelfevalSessionsPage = z.output<typeof selfevalSessionsPage>;

/** 상세. session 은 DB 행 그대로(snake_case)라 화면이 읽는 열만 검증하고 나머지는 통과시킨다. */
export const selfevalSessionDetail = z.object({
  session: z.looseObject({
    id: z.string(),
    status: z.string(),
    current_step: z.number(),
    ledger_id: z.string().nullable(),
    ledger_reversed_at: z.string().nullable(),
  }),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  terminal,
  progress,
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
export type SelfevalSessionDetail = z.output<typeof selfevalSessionDetail>;
