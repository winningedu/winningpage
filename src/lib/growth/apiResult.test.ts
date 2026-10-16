import { describe, expect, test } from "vitest";
import { normalizeApiResult } from "./apiResult";

describe("normalizeApiResult", () => {
  test("2xx이고 ok가 true면 본문을 data로 돌려준다", () => {
    const body = { ok: true, reportId: "r1" };
    expect(normalizeApiResult(200, body)).toEqual({ kind: "ok", data: body });
  });

  test("실패 본문의 code와 message를 그대로 싣는다", () => {
    const result = normalizeApiResult(409, {
      ok: false,
      code: "REPORT_LOCKED",
      message: "잠겼어요.",
    });
    expect(result).toEqual({
      kind: "error",
      status: 409,
      code: "REPORT_LOCKED",
      message: "잠겼어요.",
    });
  });

  test("code와 message 밖의 필드는 extra로 보존한다", () => {
    const result = normalizeApiResult(409, {
      ok: false,
      code: "REPORT_NOT_COMPLETED",
      message: "아직이에요.",
      open: { id: "r1" },
    });
    expect(result).toEqual({
      kind: "error",
      status: 409,
      code: "REPORT_NOT_COMPLETED",
      message: "아직이에요.",
      extra: { open: { id: "r1" } },
    });
  });

  test("모델 실패 응답의 attempts와 terminal도 extra로 남는다", () => {
    const result = normalizeApiResult(502, {
      ok: false,
      code: "MODEL_UPSTREAM_FAILED",
      message: "실패",
      attempts: 3,
      terminal: true,
    });
    expect(result).toMatchObject({
      kind: "error",
      extra: { attempts: 3, terminal: true },
    });
  });

  test("coded 형식 본문의 error.code와 error.message를 읽고 error 키는 extra에서 뺀다", () => {
    const result = normalizeApiResult(500, {
      error: { code: "STEP_FATAL", message: "종결됐어요." },
      terminal: true,
      issues: ["x"],
      progress: [{ step: 1, status: "failed" }],
    });
    expect(result).toEqual({
      kind: "error",
      status: 500,
      code: "STEP_FATAL",
      message: "종결됐어요.",
      extra: {
        terminal: true,
        issues: ["x"],
        progress: [{ step: 1, status: "failed" }],
      },
    });
  });

  test("coded 형식에서 error 안에 code가 없으면 UNKNOWN으로 둔다", () => {
    const result = normalizeApiResult(500, { error: {} });
    expect(result).toMatchObject({ kind: "error", code: "UNKNOWN" });
    if (result.kind === "error") expect(result.extra).toBeUndefined();
  });

  test("본문이 없으면 INVALID_RESPONSE 오류다", () => {
    expect(normalizeApiResult(502, null)).toMatchObject({
      kind: "error",
      status: 502,
      code: "INVALID_RESPONSE",
    });
  });

  test("2xx여도 ok가 true가 아니면 성공으로 보지 않는다", () => {
    expect(normalizeApiResult(200, { reportId: "r1" })).toMatchObject({
      kind: "error",
      code: "INVALID_RESPONSE",
    });
  });

  test("실패 본문에 code가 없으면 UNKNOWN으로 둔다", () => {
    const result = normalizeApiResult(500, { ok: false });
    expect(result).toMatchObject({ kind: "error", code: "UNKNOWN" });
  });

  test("본문 message가 없으면 일반 안내 문구를 쓴다", () => {
    const result = normalizeApiResult(500, { ok: false, code: "INTERNAL" });
    expect(result.kind).toBe("error");
    if (result.kind === "error")
      expect(result.message.length).toBeGreaterThan(0);
  });
});
