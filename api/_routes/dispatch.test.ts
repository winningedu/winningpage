import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, test, vi } from "vitest";
import { dispatch } from "./dispatch.js";

const makeReq = (url: string | undefined, query: object = {}) =>
  ({ url, query }) as unknown as VercelRequest;

const makeRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as typeof res & VercelResponse;
};

describe("dispatch", () => {
  test("등록된 경로는 같은 req, res 로 해당 핸들러만 불러와 실행한다", async () => {
    const handler = vi.fn();
    const loader = vi.fn(async () => ({ default: handler }));
    const other = vi.fn(async () => ({ default: vi.fn() }));
    const req = makeReq("/api/goal/advice");
    const res = makeRes();

    await dispatch({ "goal/advice": loader, "goal/other": other }, req, res);

    expect(handler).toHaveBeenCalledExactlyOnceWith(req, res);
    expect(other).not.toHaveBeenCalled();
  });

  test.each([
    ["/api/goal/advice?x=1", "goal/advice"],
    ["/api/change-phone/", "change-phone"],
    ["/api/goal/advice#frag", "goal/advice"],
  ])("%s 는 쿼리, 해시, 끝 슬래시를 떼고 %s 로 찾는다", async (url, key) => {
    const handler = vi.fn();
    const res = makeRes();

    await dispatch(
      { [key]: async () => ({ default: handler }) },
      makeReq(url),
      res,
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    "/api/goal/../change-phone",
    "/api/./change-phone",
    "/api/goal/%2e%2e/change-phone",
    "/api\\change-phone",
    "http://evil.example/api/change-phone",
    "//evil.example/api/change-phone",
    "/api/goal%2Fadvice",
    "/api//change-phone",
    "/api/goal//advice",
  ])("정규화가 필요한 주소 %s 는 로더 없이 404 다", async (url) => {
    const loader = vi.fn(async () => ({ default: vi.fn() }));
    const res = makeRes();

    await dispatch(
      { "change-phone": loader, "goal/advice": loader },
      makeReq(url),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(loader).not.toHaveBeenCalled();
  });

  test("없는 경로는 로더를 부르지 않고 404 NOT_FOUND 를 응답한다", async () => {
    const loader = vi.fn(async () => ({ default: vi.fn() }));
    const res = makeRes();

    await dispatch({ "goal/advice": loader }, makeReq("/api/nope"), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "NOT_FOUND" });
    expect(loader).not.toHaveBeenCalled();
  });

  test.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "프로토타입 키 %s 는 404 다",
    async (key) => {
      const res = makeRes();

      await dispatch({}, makeReq(`/api/${key}`), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "NOT_FOUND" });
    },
  );

  test("req.url 이 없으면 던지지 않고 404 다", async () => {
    const res = makeRes();

    await dispatch({}, makeReq(undefined), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("req.query 와 req.url 을 바꾸지 않는다", async () => {
    const req = makeReq("/api/goal/advice?x=1", { x: "1" });
    const res = makeRes();

    await dispatch(
      { "goal/advice": async () => ({ default: vi.fn() }) },
      req,
      res,
    );

    expect(req.url).toBe("/api/goal/advice?x=1");
    expect(req.query).toEqual({ x: "1" });
  });

  test("로더가 거부되면 응답 없이 그대로 전파한다", async () => {
    const res = makeRes();
    const routes = {
      broken: async () => {
        throw new Error("load failed");
      },
    };

    await expect(dispatch(routes, makeReq("/api/broken"), res)).rejects.toThrow(
      "load failed",
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("핸들러가 거부되면 응답 없이 그대로 전파한다", async () => {
    const res = makeRes();
    const routes = {
      boom: async () => ({
        default: async () => {
          throw new Error("handler failed");
        },
      }),
    };

    await expect(dispatch(routes, makeReq("/api/boom"), res)).rejects.toThrow(
      "handler failed",
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
