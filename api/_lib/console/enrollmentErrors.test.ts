// 학적 RPC 에러 코드를 코드가 붙은 HTTP 에러로 바꾸는 규칙 검증.

import type { VercelResponse } from "@vercel/node";
import { describe, expect, test } from "vitest";
import { sendEnrollmentRpcError } from "./enrollmentErrors.js";

const SLOT = { grade: "고2", className: "3", number: 7 };

function run(
  error: { code?: string; details?: string | null } | null,
  slot?: {
    grade: string | null;
    className: string | null;
    number: number | null;
  },
  maskName = false,
) {
  const captured: { status: number; body: unknown } = {
    status: 0,
    body: undefined,
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  const handled = sendEnrollmentRpcError(
    res,
    error,
    slot && { slot, maskName },
  );
  return { handled, ...captured };
}

const body = (code: string, message: string) => ({ error: { code, message } });

describe("sendEnrollmentRpcError", () => {
  test.each([
    ["WC077", 409, "NUMBER_TAKEN", "이미 사용 중인 번호예요."],
    [
      "WC078",
      409,
      "VERSION_CONFLICT",
      "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
    ],
    ["WC079", 409, "ALREADY_ASSIGNED", "이미 학급이 정해져 있어요."],
    ["WC080", 400, "GROUP_NOT_REGISTERED", "등록되지 않은 그룹이에요."],
    ["WC081", 404, "NOT_FOUND", "학적을 찾을 수 없어요."],
    ["WC082", 409, "REQUEST_PENDING", "이미 처리 중인 변경 신청이 있어요."],
    [
      "WC083",
      404,
      "REQUEST_NOT_FOUND",
      "신청을 찾을 수 없거나 이미 처리됐어요.",
    ],
    ["WC084", 403, "NOT_APPROVER", "이 신청을 처리할 권한이 없어요."],
    ["WC085", 400, "REJECT_REASON_REQUIRED", "거절 사유를 입력해 주세요."],
    [
      "WC086",
      409,
      "GROUP_HAS_STUDENTS",
      "재학생이 있는 그룹은 삭제할 수 없어요.",
    ],
    ["WC087", 404, "NOT_FOUND", "그룹을 찾을 수 없어요."],
    ["WC094", 403, "NOT_STUDENT", "학생 계정만 쓸 수 있어요."],
    ["23503", 400, "INVALID_CLASS", "학년, 학급 정보를 확인해 주세요."],
    ["22023", 400, "INVALID_CLASS", "학년, 학급 정보를 확인해 주세요."],
    ["23514", 400, "INVALID_CLASS", "학년, 학급 정보를 확인해 주세요."],
  ])("%s maps to %i %s", (pgCode, status, code, message) => {
    const result = run({ code: pgCode });
    expect(result).toMatchObject({
      handled: true,
      status,
      body: body(code, message),
    });
  });

  test("WC077 with a slot carries the holder with the real name for a homeroom", () => {
    const result = run({ code: "WC077", details: "홍길동" }, SLOT);
    expect(result).toMatchObject({
      status: 409,
      body: {
        error: { code: "NUMBER_TAKEN" },
        occupant: {
          grade: "고2",
          className: "3",
          number: 7,
          displayName: "홍길동",
        },
      },
    });
    expect(result.body).not.toHaveProperty("studentName");
  });

  test("WC077 masks the holder name for anyone but a homeroom (decision 30)", () => {
    const result = run({ code: "WC077", details: "홍길동" }, SLOT, true);
    expect(result.body).toMatchObject({
      occupant: { displayName: "홍*동" },
    });
  });

  test("WC077 without a holder name has a null displayName", () => {
    const result = run({ code: "WC077", details: "" }, SLOT);
    expect(result.body).toMatchObject({ occupant: { displayName: null } });
  });

  test("WC077 without a slot never leaks the holder name", () => {
    const result = run({ code: "WC077", details: "홍길동" });
    expect(result.body).not.toHaveProperty("occupant");
    expect(result.body).not.toHaveProperty("studentName");
  });

  test("unknown or missing errors are left to the caller", () => {
    expect(run({ code: "XX000" }).handled).toBe(false);
    expect(run(null).handled).toBe(false);
  });
});
