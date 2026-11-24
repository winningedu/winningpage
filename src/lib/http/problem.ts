// RFC 9457 problem details 바디. api/ 와 src/ 가 함께 쓰므로 상대 import(.js)만 쓴다.

import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

// 확장 멤버(errors 등)는 라우트마다 달라 그대로 통과시킨다.
export const problemSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  code: z.string(),
});

export type Problem = z.infer<typeof problemSchema>;
