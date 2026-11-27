// RFC 9457 problem details 바디. api/ 와 src/ 가 함께 쓰므로 상대 import(.js)만 쓴다.

import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/** 검증 실패(400 VALIDATION_FAILED)의 필드별 오류. 경로는 점으로 이은 zod 경로다(루트는 빈 문자열). */
export const problemErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ProblemFieldError = z.infer<typeof problemErrorSchema>;

// 그 밖의 확장 멤버는 라우트마다 달라 그대로 통과시킨다.
export const problemSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  code: z.string(),
  errors: z.array(problemErrorSchema).optional(),
});

export type Problem = z.infer<typeof problemSchema>;

/** zod 이슈를 problem errors 로 바꾼다. 서버의 검증 실패 응답이 모두 이 함수를 쓴다. */
export function zodIssuesToErrors(
  issues: readonly z.core.$ZodIssue[],
): ProblemFieldError[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
