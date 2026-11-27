// problem details 바디 스키마가 서버가 내는 모양을 받고 나머지는 거르는지 검증한다.

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { PROBLEM_CODE } from "./codes.js";
import {
  PROBLEM_CONTENT_TYPE,
  problemSchema,
  zodIssuesToErrors,
} from "./problem.js";

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

describe("errors 멤버", () => {
  const base = {
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    detail: "요청 값이 올바르지 않아요.",
    code: PROBLEM_CODE.VALIDATION_FAILED,
  };

  test("{ path, message } 배열이면 받는다", () => {
    const parsed = problemSchema.parse({
      ...base,
      errors: [{ path: "a.0", message: "m" }],
    });
    expect(parsed.errors).toEqual([{ path: "a.0", message: "m" }]);
  });

  test("모양이 다르면 거부한다", () => {
    expect(
      problemSchema.safeParse({ ...base, errors: [{ field: "a" }] }).success,
    ).toBe(false);
  });
});

describe("zodIssuesToErrors", () => {
  test("경로는 점으로 잇고 문구는 그대로 둔다", () => {
    const result = z
      .object({ items: z.array(z.object({ n: z.int() })), name: z.string() })
      .safeParse({ items: [{ n: "x" }], name: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodIssuesToErrors(result.error.issues)).toEqual([
      { path: "items.0.n", message: result.error.issues[0]?.message },
      { path: "name", message: result.error.issues[1]?.message },
    ]);
  });

  test("루트 오류의 경로는 빈 문자열이다", () => {
    const result = z.object({}).safeParse(null);
    if (result.success) throw new Error("통과하면 안 된다");
    expect(zodIssuesToErrors(result.error.issues)[0]?.path).toBe("");
  });
});

describe("PROBLEM_CODE", () => {
  test("키와 값이 같다(코드 문자열을 이름으로 그대로 쓴다)", () => {
    for (const [key, value] of Object.entries(PROBLEM_CODE)) {
      expect(value).toBe(key);
    }
  });
});
