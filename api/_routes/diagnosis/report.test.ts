// api/diagnosis/report.ts의 순수 검증 로직만 검증한다. 핸들러 전체(supabase I/O)는
// delete-account.test.ts와 같은 방침으로 로컬 스택 QA에서 확인한다.

import { describe, expect, test } from "vitest";
import { exceedsPayloadLimit, validateReportBody } from "./report.js";

const VALID_ATTEMPT_ID = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    attemptId: VALID_ATTEMPT_ID,
    snapshot: { meta: { schemaVersion: "2026-08-fd2" } },
    payload: { student: { name: "홍길동" } },
    schemaVersion: "2026-08-fd2",
    diagnosedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateReportBody", () => {
  test("정상 body는 ok:true와 정규화된 값을 돌려준다", () => {
    const result = validateReportBody(validRaw());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.attemptId).toBe(VALID_ATTEMPT_ID);
      expect(result.body.schemaVersion).toBe("2026-08-fd2");
    }
  });

  test("attemptId가 uuid 형식이 아니면 실패한다", () => {
    const result = validateReportBody(validRaw({ attemptId: "not-a-uuid" }));
    expect(result.ok).toBe(false);
  });

  test("snapshot이 객체가 아니면 실패한다", () => {
    expect(validateReportBody(validRaw({ snapshot: null })).ok).toBe(false);
    expect(validateReportBody(validRaw({ snapshot: "x" })).ok).toBe(false);
    expect(validateReportBody(validRaw({ snapshot: [1, 2] })).ok).toBe(false);
  });

  test("payload가 객체가 아니면 실패한다", () => {
    expect(validateReportBody(validRaw({ payload: null })).ok).toBe(false);
  });

  test("schemaVersion이 비어 있거나 문자열이 아니면 실패한다", () => {
    expect(validateReportBody(validRaw({ schemaVersion: "" })).ok).toBe(false);
    expect(validateReportBody(validRaw({ schemaVersion: "   " })).ok).toBe(
      false,
    );
    expect(validateReportBody(validRaw({ schemaVersion: 1 })).ok).toBe(false);
    expect(
      validateReportBody(validRaw({ schemaVersion: "x".repeat(65) })).ok,
    ).toBe(false);
  });

  test("diagnosedAt이 파싱 불가능한 문자열이면 실패한다", () => {
    expect(validateReportBody(validRaw({ diagnosedAt: "not-a-date" })).ok).toBe(
      false,
    );
    expect(validateReportBody(validRaw({ diagnosedAt: "" })).ok).toBe(false);
  });

  test("body가 아예 객체가 아니어도 던지지 않고 실패를 돌려준다", () => {
    expect(validateReportBody(null).ok).toBe(false);
    expect(validateReportBody(undefined).ok).toBe(false);
    expect(validateReportBody("string").ok).toBe(false);
  });
});

describe("exceedsPayloadLimit", () => {
  test("작은 payload는 상한을 넘지 않는다", () => {
    const result = validateReportBody(validRaw());
    if (!result.ok) throw new Error("fixture invalid");
    expect(exceedsPayloadLimit(result.body)).toBe(false);
  });

  test("512KB를 넘는 payload는 상한을 초과한다", () => {
    const result = validateReportBody(
      validRaw({ payload: { big: "x".repeat(600 * 1024) } }),
    );
    if (!result.ok) throw new Error("fixture invalid");
    expect(exceedsPayloadLimit(result.body)).toBe(true);
  });
});
