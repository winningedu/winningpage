// sendError 의 에러 바디 모양을 검증한다. 기존 4종은 바이트가 바뀌면 안 된다.

import type { VercelResponse } from "@vercel/node";
import { describe, expect, test } from "vitest";
import { problemBody, sendError } from "./httpResponse.js";

interface Captured {
  status: number;
  json: unknown;
  raw: string | undefined;
  headers: Record<string, string>;
}

function fakeRes(requestHeaders: Record<string, string> = {}) {
  const out: Captured = {
    status: 0,
    json: undefined,
    raw: undefined,
    headers: {},
  };
  const res = {
    req: { headers: requestHeaders },
    setHeader(key: string, value: string) {
      out.headers[key] = value;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.json = payload;
      return res;
    },
    end(payload: string) {
      out.raw = payload;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, out };
}

describe("sendError 기존 shape", () => {
  test("detail", () => {
    const { res, out } = fakeRes();
    sendError(res, "detail", 400, "m", "C", { a: 1 });
    expect(out.status).toBe(400);
    expect(JSON.stringify(out.json)).toBe('{"detail":"m","a":1}');
  });

  test("okDetail", () => {
    const { res, out } = fakeRes();
    sendError(res, "okDetail", 400, "m", "C", { a: 1 });
    expect(JSON.stringify(out.json)).toBe('{"ok":false,"detail":"m","a":1}');
  });

  test("error", () => {
    const { res, out } = fakeRes();
    sendError(res, "error", 400, "m", "C", { a: 1 });
    expect(JSON.stringify(out.json)).toBe('{"error":"m","a":1}');
  });

  test("coded", () => {
    const { res, out } = fakeRes();
    sendError(res, "coded", 403, "m", "C", { a: 1 });
    expect(JSON.stringify(out.json)).toBe(
      '{"error":{"code":"C","message":"m"},"a":1}',
    );
  });
});

describe("sendError problem shape", () => {
  test("problem+json 헤더와 표준 멤버를 낸다", () => {
    const { res, out } = fakeRes({ "x-vercel-id": "icn1::abc" });
    sendError(res, "problem", 403, "권한이 없어요.", "FORBIDDEN");

    expect(out.status).toBe(403);
    expect(out.headers["Content-Type"]).toBe("application/problem+json");
    expect(JSON.parse(out.raw as string)).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail: "권한이 없어요.",
      instance: "icn1::abc",
      code: "FORBIDDEN",
    });
  });

  test("x-vercel-id 가 없으면 instance 멤버가 없다", () => {
    const { res, out } = fakeRes();
    sendError(res, "problem", 404, "없어요.", "NOT_FOUND");

    expect(JSON.parse(out.raw as string)).not.toHaveProperty("instance");
  });

  test("extra 멤버를 더하되 표준 멤버는 덮어쓰지 못한다", () => {
    const { res, out } = fakeRes();
    sendError(res, "problem", 400, "d", "C", {
      errors: [1],
      status: 200,
      code: "X",
      detail: "x",
      title: "x",
      type: "x",
      instance: "x",
    });

    expect(JSON.parse(out.raw as string)).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "d",
      code: "C",
      errors: [1],
    });
  });

  test("code 가 없으면 500 은 INTERNAL_ERROR 로 낸다", () => {
    const { res, out } = fakeRes();
    sendError(res, "problem", 500, "서버 오류");

    expect(JSON.parse(out.raw as string)).toMatchObject({
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
    });
  });

  test("빈 문자열 code 도 500 은 INTERNAL_ERROR 로 낸다", () => {
    const { res, out } = fakeRes();
    sendError(res, "problem", 500, "서버 오류", "");

    expect(JSON.parse(out.raw as string).code).toBe("INTERNAL_ERROR");
  });

  test("빈 문자열 code 인 500 외 상태는 던진다", () => {
    const { res } = fakeRes();
    expect(() => sendError(res, "problem", 400, "x", "")).toThrow();
  });

  test("code 가 없는 500 외 상태는 프로그래밍 오류로 던진다", () => {
    const { res } = fakeRes();
    expect(() => sendError(res, "problem", 400, "x")).toThrow();
  });
});

describe("problemBody", () => {
  test("sendError problem 이 쓰는 바디와 글자까지 같다", () => {
    const cases: [
      number,
      string,
      string | undefined,
      Record<string, unknown> | undefined,
    ][] = [
      [403, "권한이 없어요.", "FORBIDDEN", undefined],
      [400, "d", "C", { errors: [{ path: "a", message: "m" }], instance: "x" }],
      [500, "서버 오류", undefined, undefined],
    ];
    for (const [status, message, code, extra] of cases) {
      const { res, out } = fakeRes({ "x-vercel-id": "icn1::abc" });
      sendError(res, "problem", status, message, code, extra);
      expect(problemBody(status, message, code, extra, "icn1::abc")).toBe(
        out.raw,
      );
    }
  });

  test("요청 id 가 없으면 instance 를 싣지 않는다", () => {
    expect(JSON.parse(problemBody(404, "없어요.", "NOT_FOUND"))).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "없어요.",
      code: "NOT_FOUND",
    });
  });

  test("500 이 아닌데 code 가 없으면 던진다", () => {
    expect(() => problemBody(400, "x", undefined)).toThrow();
  });
});
