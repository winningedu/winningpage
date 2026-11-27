// 자기평가서 최종 저장 계약. POST /api/selfeval/finalize 의 요청과 응답 스키마.
// 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.

import { z } from "zod";

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
const sessionId = z.guid();

/**
 * 활동 기록으로 남길 7항목(명세 No.43, No.63). 요청 형식 검사(finalizeBody)는 이 모양을 보지 않는다:
 * 틀리면 VALIDATION_FAILED 가 아니라 학생에게 보이는 문구의 PROMOTED_INVALID 400 이라 라우트가 이 스키마로 따로 읽는다.
 */
export const promotedRecord = z.object({
  topic: z.string().trim().min(1),
  concept: z.string(),
  method: z.string(),
  result: z.string(),
  limitation: z.string(),
  numbers: z.array(z.string()),
  sources: z.array(z.string()),
});

const optionalBoolean = (fallback: boolean) =>
  z
    .boolean()
    .nullish()
    .transform((value) => value ?? fallback);

export const finalizeBody = z.object({
  sessionId,
  promoted: z.unknown().optional(),
  /** 성장설계 과제를 이행한 것으로 회신할지. 생략하면 true. */
  fulfillsPlanItem: optionalBoolean(true),
  /** 필수 수정이 남은 채 저장하겠다고 학생이 경고를 확인했는지. 생략하면 false. */
  acknowledgeMandatory: optionalBoolean(false),
});

/** 브라우저가 보내는 모양. promoted 는 promotedRecord 의 입력으로 만든다. */
export type FinalizeBodyInput = Omit<
  z.input<typeof finalizeBody>,
  "promoted"
> & { promoted: z.input<typeof promotedRecord> };

/** 성장설계 회신 결과. failed 는 저장은 유효하고 다음 진입 때 다시 보낸다. */
const replySchema = z.looseObject({
  status: z.enum(["sent", "skipped", "failed"]),
  code: z.string().optional(),
});

export const finalizeResponse = z.looseObject({
  activityRecordId: z.string(),
  finalRevision: z.number(),
  reply: replySchema,
  currentStep: z.literal(6),
});
