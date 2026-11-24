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
