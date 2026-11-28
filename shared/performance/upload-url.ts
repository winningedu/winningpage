// 수행평가 안내문 업로드 토큰 계약. POST /api/performance/upload-url 의 요청과 응답 스키마.
// 형식 검사(누락, 타입, uuid)는 여기서 하고, MIME 허용 목록과 용량 한도는 도메인 규칙이라 라우트가 판정한다.

import { z } from "zod";

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
export const uploadUrlBody = z.object({
  sessionId: z.guid(),
  mimeType: z.string().trim().toLowerCase(),
  byteSize: z.int().positive(),
});

/** 브라우저가 보내는 모양. */
export type UploadUrlBodyInput = z.input<typeof uploadUrlBody>;

export const uploadUrlResponse = z.looseObject({
  attachmentId: z.string(),
  bucket: z.string(),
  path: z.string(),
  token: z.string(),
  signedUrl: z.string(),
  expiresAt: z.string(),
});
