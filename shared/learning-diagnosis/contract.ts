// 학습진단 관리 API 계약. 서버(api/_routes/admin/learning-diagnosis.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/learning-diagnosis/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id 가 질문, 답변, 추천 프로그램 uuid 인 라우트. */
export const idParams = z.object({ id: uuidId });

/** 질문 등록(POST)과 수정(PATCH) 본문. 옛 화면이 만들 수 있던 컬럼만 받고 나머지 키는 strict 가 400 으로 막는다. */
export const questionBody = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string(),
  input_type: z.enum(["single", "multiple"]),
  is_required: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.int(),
});

// 답변 등록은 빈 label 도 받는다(화면이 빈 답변을 먼저 만들고 채운다). 수정은 비어 있지 않아야 한다.
const optionFields = {
  program_ids: z.array(z.string()),
  is_active: z.boolean(),
  sort_order: z.int(),
};

export const optionCreateBody = z.strictObject({
  question_id: z.uuid(),
  label: z.string(),
  ...optionFields,
});

/** 답변 수정 본문. question_id 는 쓰지 않는다. */
export const optionPatchBody = z.strictObject({
  label: z.string().trim().min(1),
  ...optionFields,
});

/** 추천 프로그램 등록(POST)과 수정(PATCH) 본문. */
export const programBody = z.strictObject({
  title: z.string().trim().min(1),
  badge: z.string(),
  description: z.string(),
  primary_button_text: z.string(),
  primary_button_link: z.string(),
  secondary_button_text: z.string(),
  secondary_button_link: z.string(),
  icon: z.string(),
  is_active: z.boolean(),
  sort_order: z.int(),
});

/** 브라우저가 보내는 모양. */
export type QuestionInput = z.input<typeof questionBody>;
export type OptionCreateInput = z.input<typeof optionCreateBody>;
export type OptionPatchInput = z.input<typeof optionPatchBody>;
export type ProgramInput = z.input<typeof programBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다. 컬럼 대부분이 nullable 이라 화면이 읽을 때 좁힌다.
export const questionSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  input_type: z.string(),
  is_required: z.boolean().nullable(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type QuestionRow = z.infer<typeof questionSchema>;

// program_ids 는 text[] 컬럼이라 문자열 배열이거나 null 이다.
export const optionSchema = z.looseObject({
  id: z.string(),
  question_id: z.string().nullable(),
  label: z.string().nullable(),
  option_text: z.string(),
  program_ids: z.array(z.string()).nullable(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type OptionRow = z.infer<typeof optionSchema>;

export const programSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  badge: z.string().nullable(),
  description: z.string().nullable(),
  primary_button_text: z.string().nullable(),
  primary_button_link: z.string().nullable(),
  secondary_button_text: z.string().nullable(),
  secondary_button_link: z.string().nullable(),
  icon: z.string().nullable(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type ProgramRow = z.infer<typeof programSchema>;

export const questionListSchema = z.object({ items: z.array(questionSchema) });
export const optionListSchema = z.object({ items: z.array(optionSchema) });
export const programListSchema = z.object({ items: z.array(programSchema) });
export type QuestionList = z.output<typeof questionListSchema>;
export type OptionList = z.output<typeof optionListSchema>;
export type ProgramList = z.output<typeof programListSchema>;
