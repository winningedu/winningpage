// 심화탐구 세션 운영 조회 API 계약(GET /api/admin/inquiry-sessions, /:id). 서버(api/_routes/admin/inquiry-sessions.ts)는
// 요청 스키마로 검증하고, 브라우저(src/pages/admin/inquiry/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

/** 목록 쿼리 값의 규칙(허용 상태, 페이지 범위)과 한국어 사유를 서버 parseListQuery 가 맡을 때 쓰는 코드. */
export const INQUIRY_SESSION_ERROR = {
  INVALID_QUERY: "INVALID_QUERY",
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

const terminal = z.object({
  reason: z.string(),
  at: z.string(),
  mode: z.string(),
});

/** 세션 한 건. 목록 항목과 상세가 같은 모양이다(프로필 이름, 이메일, 선택 주제 제목 포함). */
export const inquirySession = z.object({
  id: z.string(),
  profileId: z.string(),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  currentStep: z.number(),
  subject: z.string(),
  topicTitle: z.string().nullable(),
  completedAt: z.string().nullable(),
  // inquiry_sessions.last_activity_at 은 not null 이다.
  lastActivityAt: z.string(),
  ledgerId: z.string().nullable(),
  ledgerReversedAt: z.string().nullable(),
  terminal: terminal.nullable(),
  generation: z.object({
    modes: z.record(
      z.string(),
      z.object({
        status: z.string(),
        attempts: z.number(),
        startedAt: z.string().nullable(),
        finishedAt: z.string().nullable(),
        issues: z.array(z.unknown()),
      }),
    ),
    terminal: terminal.nullable(),
  }),
  evaluationCount: z.number(),
  topicRoundCount: z.number(),
});
export type InquirySession = z.output<typeof inquirySession>;

export const inquirySessionsPage = z.object({
  items: z.array(inquirySession),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type InquirySessionsPage = z.output<typeof inquirySessionsPage>;
