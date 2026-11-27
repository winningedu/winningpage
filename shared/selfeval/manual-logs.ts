// 자기평가서 수기 수행보고 메모 계약. POST /api/selfeval/manual-logs 의 요청 본문과 응답(명세 No.77, 158~161, 90, 91, 140).
// 요청 본문은 모양만 본다. 붙여넣은 글과 파일의 길이, 형식 규칙(TEXT_TOO_LONG, FILE_TYPE 등)은 학생에게 보이는 문구와 자기 code 가 있어 서버가 따로 본다.

import { z } from "zod";

const sessionIdSchema = z.guid();
const memoIdSchema = z.guid();

export const manualLogsBody = z.discriminatedUnion("action", [
  z.object({ sessionId: sessionIdSchema, action: z.literal("list") }),
  z.object({
    sessionId: sessionIdSchema,
    action: z.literal("upload"),
    text: z.string().optional(),
    file: z.object({ mimeType: z.string(), data: z.string() }).nullish(),
  }),
  z.object({
    sessionId: sessionIdSchema,
    action: z.literal("update"),
    memoId: memoIdSchema,
    writtenAt: z.iso.date().optional(),
    text: z.string().optional(),
    confirmed: z.boolean().optional(),
  }),
  z.object({
    sessionId: sessionIdSchema,
    action: z.literal("set-included"),
    memoId: memoIdSchema,
    included: z.boolean(),
  }),
  z.object({
    sessionId: sessionIdSchema,
    action: z.literal("delete"),
    memoId: memoIdSchema,
  }),
]);

export type ManualLogsInput = z.output<typeof manualLogsBody>;

export const manualMemoSchema = z.looseObject({
  id: z.string(),
  writtenAt: z.string().nullable(),
  text: z.string(),
  ocr: z.boolean(),
  confirmed: z.boolean(),
  included: z.boolean(),
  /** 사람 이름이나 학교 이름이 보여 지우거나 바꾸라고 안내해야 하는 메모. */
  nameNotice: z.boolean(),
});

export const manualLogsListResponseSchema = z.looseObject({
  memos: z.array(manualMemoSchema),
});

export const manualLogsUploadResponseSchema = z.looseObject({
  memos: z.array(manualMemoSchema),
  personNameDetected: z.boolean(),
});

/** update, set-included 의 응답. */
export const manualLogsMemoResponseSchema = z.looseObject({
  memo: manualMemoSchema,
});

/** delete 의 응답. 돌려줄 값이 없다. */
export const manualLogsDeleteResponseSchema = z.looseObject({});

export type ManualMemo = z.output<typeof manualMemoSchema>;
export type ManualLogsListResponse = z.output<
  typeof manualLogsListResponseSchema
>;
export type ManualLogsUploadResponse = z.output<
  typeof manualLogsUploadResponseSchema
>;
export type ManualLogsMemoResponse = z.output<
  typeof manualLogsMemoResponseSchema
>;
