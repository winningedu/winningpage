// 수행평가 안내문 사진 회수 계약. POST /api/performance/discard-attachment 의 요청과 응답 스키마.
// 형식 검사(누락, uuid)는 여기서 하고, 소유권과 pending 여부는 도메인 규칙이라 라우트가 판정한다.

import { z } from "zod";

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
export const discardAttachmentBody = z.object({
  sessionId: z.guid(),
  attachmentId: z.guid(),
});

/** 브라우저가 보내는 모양. */
export type DiscardAttachmentBodyInput = z.input<typeof discardAttachmentBody>;

export const discardAttachmentResponse = z.looseObject({
  discarded: z.literal(true),
  attachmentId: z.string(),
});
