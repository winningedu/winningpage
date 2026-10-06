import { describe, expect, test } from "vitest";
import { GENERIC_ERROR_MESSAGE, normalizeApiResult } from "./apiResult";

describe("inquiry apiResult 재수출", () => {
  test("성장설계와 같은 계약으로 성공과 coded 실패를 정규화한다", () => {
    const body = { ok: true, session: null };
    expect(normalizeApiResult(200, body)).toEqual({ kind: "ok", data: body });
    expect(
      normalizeApiResult(409, {
        ok: false,
        error: { code: "SESSION_LOCKED", message: "잠겼어요." },
        terminal: true,
      }),
    ).toEqual({
      kind: "error",
      status: 409,
      code: "SESSION_LOCKED",
      message: "잠겼어요.",
      extra: { terminal: true },
    });
    expect(GENERIC_ERROR_MESSAGE).not.toBe("");
  });
});
