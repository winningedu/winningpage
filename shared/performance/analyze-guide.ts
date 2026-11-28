// 수행평가 안내문 분석 계약. POST /api/performance/analyze-guide 의 요청과 응답 스키마.
// 형식 검사(uuid, 첨부 개수, 둘 다 비어 있음)는 여기서 하고, 두 입력을 함께 보낸 경우, 직접 입력 글자 수 상한, 소유권,
// 첨부 상태와 용량, 호출 상한은 도메인 규칙이라 라우트가 판정한다.
// 안내문 분석 구조(guide)는 모델 산출물이라 안쪽은 화면이 좁혀 읽는다.

import { z } from "zod";

/** 한 번에 분석할 수 있는 안내문 사진 수. 업로드 한도(upload-url)와 같은 값이다. */
export const GUIDE_ATTACHMENTS_MAX = 5;

export const analyzeGuideBody = z
  .object({
    // DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
    sessionId: z.guid(),
    /** 업로드 분기. 경로 문자열은 받지 않고 첨부 id 만 받는다. */
    attachmentIds: z
      .array(z.guid())
      .min(1)
      .max(GUIDE_ATTACHMENTS_MAX)
      .nullish(),
    /** 직접 입력 분기. 앞뒤 공백은 자른다. */
    freetext: z.string().trim().optional(),
    /** true 면 이미 분석한 첨부도 다시 분석한다. */
    force: z.boolean().optional(),
  })
  .refine((body) => body.attachmentIds != null || Boolean(body.freetext), {
    path: ["attachmentIds"],
    message: "attachmentIds 또는 freetext가 필요합니다.",
  });

/** 브라우저가 보내는 모양. */
export type AnalyzeGuideBodyInput = z.input<typeof analyzeGuideBody>;

export const analyzeGuideResponse = z.looseObject({
  /** mode 는 manual 또는 upload 다. 나머지는 모델 산출물이라 화면이 좁혀 읽는다. */
  guide: z.looseObject({ mode: z.string() }),
  attachments: z.array(
    z.looseObject({ attachmentId: z.string(), deleted: z.boolean() }),
  ),
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  charged: z.literal(false),
  /** 업로드 분기에서만 온다. 저장분을 그대로 돌려줬으면 true. */
  reused: z.boolean().optional(),
});
