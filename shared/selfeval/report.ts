// 자기평가서 리포트 계약. GET, POST /api/selfeval/report 의 요청과 응답(명세 No.133, 172, 173).
// 리포트 본문(payload)의 장별 모양은 서버가 만들고 화면이 읽는 src/lib/selfeval/reportTypes.ts 가 가진다.
// 여기서는 payload 를 version 만 보는 느슨한 객체로 두고, 브라우저가 자기 타입으로 좁혀 읽는다.

import { z } from "zod";

/** 세션 하나의 리포트를 부른다. 값은 DB uuid 컬럼에 가므로 형식만 본다. */
export const reportQuery = z.object({ sessionId: z.guid() });

/** 리포트를 만들거나 다시 만든다. */
export const reportBody = z.object({ sessionId: z.guid() });

/** building 은 저장되지 않고, 선점이 진행 중일 때 읽기가 돌려준다. */
export const REPORT_VIEW_STATUSES = ["ready", "failed", "building"] as const;

export const reportViewSchema = z.looseObject({
  sessionId: z.string(),
  finalRevision: z.number(),
  status: z.enum(REPORT_VIEW_STATUSES),
  attempts: z.number(),
  builtAt: z.string(),
  /** 만들지 못한 리포트(failed)는 null. */
  payload: z.looseObject({ version: z.literal(1) }).nullable(),
});

export const reportResponseSchema = z.looseObject({
  /** POST 에서만. 같은 리비전의 완성본을 다시 만들지 않고 돌려줬는지. */
  reused: z.boolean().optional(),
  report: reportViewSchema,
});

export type ReportViewShape = z.output<typeof reportViewSchema>;
