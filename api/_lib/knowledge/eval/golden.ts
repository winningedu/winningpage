// 기준 문제집(knowledge_golden_queries) 쓰기 입력. 옛 화면 폼(QueryDialog)이 만드는 열만 받는다.
// 모르는 키와 폼이 만들지 않는 열(id, is_active 등)은 zod strict 로 400 이다.

import { z } from "zod";

/** 옛 화면이 읽던 열. 목록, 만든 행, 고친 행이 같은 모양이다. */
export const GOLDEN_COLUMNS =
  "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids, is_active, created_at";

export const goldenKnowledgeTypeSchema = z.enum([
  "topic_pattern",
  "verified_resource",
]);

const goldenFields = {
  grade: z.string().min(1),
  subject: z.string().min(1),
  career: z.string().nullable(),
  selected_topic: z.string().nullable(),
  assessment_info: z.string().nullable(),
  note: z.string().nullable(),
  // 테이블 CHECK 도 1개 이상이라 같은 규칙을 앞에서 막는다.
  expected_resource_ids: z.array(z.uuid()).min(1),
};

export const goldenCreateSchema = z.strictObject({
  knowledge_type: goldenKnowledgeTypeSchema,
  ...goldenFields,
});

// 수정은 폼 필드 일부와 비활성 토글(is_active)을 받는다. knowledge_type 은 받지 않는다.
export const goldenPatchSchema = z
  .strictObject({ ...goldenFields, is_active: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "고칠 값이 하나 이상 필요합니다.",
  });
