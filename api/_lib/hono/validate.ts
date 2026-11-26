// zod 검증 실패를 defineHandler 와 같은 400 VALIDATION_FAILED 로 낸다. 통과한 값은 c.req.valid(target) 로 읽는다.
// json 대상은 Content-Type 이 JSON 이 아니면 Hono 가 {} 를 검증한다. JSON 인데 깨진 본문은 Hono 가 던지고 handleError 가 같은 400 으로 바꾼다.

import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { validationFailed } from "./problem.js";

export const validate = <
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;
    return validationFailed(
      c,
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  });
