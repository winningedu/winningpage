// 회원 문자 발송 API 계약. 서버(api/_routes/admin/send-message.ts)가 요청 스키마로 검증하고, 브라우저(회원 상세 화면)가 응답 스키마로 검증한다.

import { z } from "zod";

/** 문자 발송 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const SEND_MESSAGE_ERROR = {
  TEXT_REQUIRED: "TEXT_REQUIRED",
  RECIPIENT_REQUIRED: "RECIPIENT_REQUIRED",
  SEND_FAILED: "SEND_FAILED",
} as const;

export type SendMessageErrorCode =
  (typeof SEND_MESSAGE_ERROR)[keyof typeof SEND_MESSAGE_ERROR];

/** POST 본문. 번호를 주지 않으면 서버가 profileId 로 profiles 에서 읽는다(마스킹 상태라 화면이 원문을 모를 수 있다). */
export const sendMessageBody = z.object({
  profileId: z.string().optional(),
  phone: z.string().optional(),
  text: z.string(),
  subject: z.string().optional(),
});

/** 브라우저가 보내는 모양. */
export type SendMessageInput = z.input<typeof sendMessageBody>;

/** 200 응답. logId 는 alimtalk_send_logs.id 이고 이력 적재가 비면 null 이다. */
export const sendMessageResultSchema = z.object({
  channel: z.string(),
  logId: z.number().nullable(),
});

export type SendMessageResult = z.output<typeof sendMessageResultSchema>;
