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

describe("경로 파라미터", () => {
  const run = async (
    routes: Record<string, () => Promise<{ default: () => void }>>,
    url: string,
    query: Record<string, unknown> | undefined = {},
  ) => {
    const req = makeReq(url, query as object);
    if (query === undefined) delete (req as { query?: unknown }).query;
    const res = makeRes();
    await dispatch(routes as never, req, res);
    return { req, res };
  };
  const loaderOf =
    (handler = vi.fn()) =>
    async () => ({ default: handler });

  test("[name] 구간은 한 구간과 맞고 req.query 에 문자열로 담긴다", async () => {
    const handler = vi.fn();
    const { req } = await run(
      { "admin/sections/[key]/[id]": loaderOf(handler) },
      "/api/admin/sections/banners/12",
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(req.query).toEqual({ key: "banners", id: "12" });
  });

  test("req.query 가 없으면 만들어서 담는다", async () => {
    const { req } = await run(
      { "a/[key]": loaderOf() },
      "/api/a/banners",
      undefined,
    );

    expect(req.query).toEqual({ key: "banners" });
  });

  test("정확한 키가 패턴보다 먼저다", async () => {
    const exact = vi.fn();
    const pattern = vi.fn();
    await run(
      { "a/[key]": loaderOf(pattern), "a/export": loaderOf(exact) },
      "/api/a/export",
    );

    expect(exact).toHaveBeenCalledOnce();
    expect(pattern).not.toHaveBeenCalled();
  });

  test("구간마다 글자 그대로인 쪽이 [param] 보다 이긴다", async () => {
    const literal = vi.fn();
    const param = vi.fn();
    const { req } = await run(
      {
        "admin/sections/[key]/[id]": loaderOf(param),
        "admin/sections/[key]/export": loaderOf(literal),
      },
      "/api/admin/sections/banners/export",
    );

    expect(literal).toHaveBeenCalledOnce();
    expect(param).not.toHaveBeenCalled();
    expect(req.query).toEqual({ key: "banners" });
  });

  test("앞 구간이 글자인 패턴이 뒤 구간이 글자인 패턴보다 이긴다", async () => {
    const first = vi.fn();
    const second = vi.fn();
    await run(
      { "a/[x]/c": loaderOf(second), "a/b/[y]": loaderOf(first) },
      "/api/a/b/c",
    );

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  test("쿼리스트링 값이 경로 파라미터를 바꾸지 못한다", async () => {
    const { req } = await run(
      { "admin/sections/[key]": loaderOf() },
      "/api/admin/sections/banners?key=adminMembers",
      { key: "adminMembers", page: "2" },
    );

    expect(req.query).toEqual({ key: "banners", page: "2" });
  });

  test.each(["a b", "ab.c", "a:b", "a@b", "a;b", "한글"])(
    "파라미터 값 %s 는 허용 문자가 아니라 404 다",
    async (value) => {
      const handler = vi.fn();
      const { res } = await run(
        { "a/[key]": loaderOf(handler) },
        `/api/a/${value}`,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  test.each(["/api/a/../b", "/api/a/./b", "/api/a/%2e%2e", "/api/a//b"])(
    "점 구간과 빈 구간 %s 는 패턴이 있어도 404 다",
    async (url) => {
      const handler = vi.fn();
      const { res } = await run(
        { "a/[key]": loaderOf(handler), "[x]/[y]": loaderOf(handler) },
        url,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  test("구간 수가 다르면 404 다", async () => {
    const handler = vi.fn();
    const routes = { "a/[key]/[id]": loaderOf(handler) };

    const short = await run(routes, "/api/a/x");
    const long = await run(routes, "/api/a/x/y/z");

    expect(short.res.status).toHaveBeenCalledWith(404);
    expect(long.res.status).toHaveBeenCalledWith(404);
    expect(handler).not.toHaveBeenCalled();
  });

  test("패턴이 안 맞으면 req.query 를 건드리지 않는다", async () => {
    const { req } = await run({ "a/[key]/x": loaderOf() }, "/api/a/b/y", {
      key: "q",
    });

    expect(req.query).toEqual({ key: "q" });
  });
});

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
