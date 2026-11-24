// problem details 바디 스키마가 서버가 내는 모양을 받고 나머지는 거르는지 검증한다.

import { describe, expect, test } from "vitest";
import { PROBLEM_CONTENT_TYPE, problemSchema } from "./problem.js";

describe("problemSchema", () => {
  test("콘텐츠 타입 상수는 application/problem+json 이다", () => {
    expect(PROBLEM_CONTENT_TYPE).toBe("application/problem+json");
  });

  test("표준 멤버와 확장 멤버를 그대로 통과시킨다", () => {
    const body = {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "입력을 확인해 주세요.",
      instance: "icn1::abc",
      code: "VALIDATION_FAILED",
      errors: [{ path: "name", message: "required" }],
    };

    expect(problemSchema.parse(body)).toEqual(body);
  });

  test("instance 는 없어도 된다", () => {
    const body = {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "없어요.",
      code: "NOT_FOUND",
    };

    expect(problemSchema.safeParse(body).success).toBe(true);
  });

  test.each([
    ["기존 detail 바디", { detail: "실패" }],
    [
      "code 누락",
      { type: "about:blank", title: "x", status: 500, detail: "d" },
    ],
    [
      "status 가 정수가 아님",
      { type: "about:blank", title: "x", status: 5.5, detail: "d", code: "C" },
    ],
  ])("%s 는 거부한다", (_name, body) => {
    expect(problemSchema.safeParse(body).success).toBe(false);
  });
});
