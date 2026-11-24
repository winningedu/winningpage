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
