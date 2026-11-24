// GET 과 POST 를 함께 받는 파일은 defineHandler 의 body, query 옵션을 쓸 수 없다(옵션은 모든 메서드에 걸린다).
// 그런 라우트가 핸들러 안에서 부르는 검증이다. 실패 바디는 defineHandler 의 검증 실패와 같은 모양(400 VALIDATION_FAILED, errors)이다.

import type { VercelResponse } from "@vercel/node";
import type { z } from "zod";
import { sendError } from "../httpResponse.js";

/** 통과하면 파싱된 값, 실패하면 400 을 보내고 null. */
export function parseInput<T extends z.ZodType>(
  res: VercelResponse,
  schema: T,
  input: unknown,
): z.output<T> | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  sendError(
    res,
    "problem",
    400,
    "요청 값이 올바르지 않아요.",
    "VALIDATION_FAILED",
    {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  );
  return null;
}
