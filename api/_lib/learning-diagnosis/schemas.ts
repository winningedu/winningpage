// 학습진단 쓰기 본문. 옛 화면이 만들 수 있던 컬럼만 받고 나머지 키는 strict 가 400 으로 막는다.

import { z } from "zod";

export const questionBodySchema = z.strictObject({
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

export const optionCreateSchema = z.strictObject({
  question_id: z.uuid(),
  label: z.string(),
  ...optionFields,
});

export const optionPatchSchema = z.strictObject({
  label: z.string().trim().min(1),
  ...optionFields,
});

/** option_text 는 옛 NOT NULL 컬럼이라 label 을 그대로 미러링한다. */
export function withOptionText<T extends { label: string }>(body: T) {
  return { ...body, option_text: body.label };
}

export const programBodySchema = z.strictObject({
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
