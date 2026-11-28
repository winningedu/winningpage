// 자기평가서 본문 생성과 편집 계약. POST /api/selfeval/write 의 요청(generate, edit, confirm-feeling,
// repick-evidence)과 응답 스키마. 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.

import { z } from "zod";
import { sessionStepSchema } from "./contract.js";
import { generationSectionsSchema } from "./sections.js";
import { stepIssueSchema } from "./session.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 편집 때 보낼 수 있는 문단 수 상한. 하한은 1개다. */
export const MAX_EDIT_PARAGRAPHS = 6;
/** 한 문장의 근거를 다시 고를 때 보낼 수 있는 선택 수 상한. */
export const MAX_REPICKS = 30;

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
const sessionId = z.guid();
const sentenceId = z.string().min(1);

export const writeBody = z.discriminatedUnion("action", [
  z.object({ sessionId, action: z.literal("generate") }),
  z.object({
    sessionId,
    action: z.literal("edit"),
    paragraphs: z.array(z.string()).min(1).max(MAX_EDIT_PARAGRAPHS),
  }),
  z.object({
    sessionId,
    action: z.literal("confirm-feeling"),
    sentenceId,
  }),
  z.object({
    sessionId,
    action: z.literal("repick-evidence"),
    sentenceId,
    picks: z
      .array(z.object({ refId: z.string(), item: z.string() }))
      .max(MAX_REPICKS),
  }),
]);

/** 브라우저가 보내는 모양. */
export type WriteBodyInput = z.input<typeof writeBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 저장한 본문. */
export const writtenReportSchema = z.looseObject({
  id: z.string(),
  revision: z.number(),
  sections: generationSectionsSchema,
  charCount: z.looseObject({
    withSpace: z.number(),
    withoutSpace: z.number(),
  }),
});

/** generate 의 응답. charged false 는 차감하지 못한 것이지 생성 실패가 아니다. */
export const writeGenerateResponse = z.looseObject({
  report: writtenReportSchema,
  charged: z.boolean(),
  regenerationsLeft: z.number(),
  currentStep: sessionStepSchema,
  attempts: z.number(),
  softIssues: z.array(stepIssueSchema),
});

/** edit, confirm-feeling, repick-evidence 의 응답. */
export const writeEditResponse = z.looseObject({
  report: writtenReportSchema,
});
