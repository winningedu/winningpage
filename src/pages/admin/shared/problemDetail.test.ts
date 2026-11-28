import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/http/client";
import { problemDetail } from "./problemDetail";

const problem = (code: string, errors?: { path: string; message: string }[]) =>
  new ApiError({
    status: 400,
    code,
    detail: "요청 값이 올바르지 않아요.",
    problem: {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "요청 값이 올바르지 않아요.",
      code,
      ...(errors ? { errors } : {}),
    },
  });

describe("problemDetail", () => {
  test("검증 실패의 첫 오류 문구가 있으면 그것을 보인다", () => {
    const error = problem("VALIDATION_FAILED", [
      { path: "items", message: "3번째 행: 이름이 비어 있습니다." },
      { path: "items", message: "뒤 오류" },
    ]);

    expect(problemDetail(error, "기본")).toBe(
      "3번째 행: 이름이 비어 있습니다.",
    );
  });

  test("errors 가 없거나 비었으면 서버 detail 을 보인다", () => {
    expect(problemDetail(problem("VALIDATION_FAILED"), "기본")).toBe(
      "요청 값이 올바르지 않아요.",
    );
    expect(problemDetail(problem("VALIDATION_FAILED", []), "기본")).toBe(
      "요청 값이 올바르지 않아요.",
    );
  });

  test("검증 실패가 아닌 코드는 errors 가 있어도 detail 을 보인다", () => {
    const error = problem("CONFLICT", [{ path: "x", message: "다른 문구" }]);

    expect(problemDetail(error, "기본")).toBe("요청 값이 올바르지 않아요.");
  });

  test("ApiError 가 아니면 기본 문구를 보인다", () => {
    expect(problemDetail(new Error("x"), "기본")).toBe("기본");
  });
});
