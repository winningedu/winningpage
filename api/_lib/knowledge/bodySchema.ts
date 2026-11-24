// 기존 검증 함수(validate*Body)를 defineHandler 의 body 스키마로 잇는다. 실패 사유가 400 VALIDATION_FAILED 의 message 가 된다.

import { z } from "zod";

export function knowledgeBodySchema<T>(
  validate: (
    raw: unknown,
  ) => { ok: true; body: T } | { ok: false; reason: string },
) {
  return z.unknown().transform((raw, ctx) => {
    const parsed = validate(raw);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.reason });
      return z.NEVER;
    }
    return parsed.body;
  });
}
