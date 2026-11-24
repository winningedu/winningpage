// defineHandler 가 요청마다 로그 한 줄만 남기고, 민감한 값은 싣지 않는지 검증한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("./supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { defineHandler } from "./handler.js";

function route(
  auth: "none" | "user",
  handler: Parameters<typeof defineHandler>[0]["handler"] = async (
    _req,
    res,
  ) => {
    res.status(201).json({ ok: true });
  },
) {
  return defineHandler({
    methods: ["POST"],
    auth,
    errorShape: "problem",
    unhandledMessage: "실패",
    handler,
  });
}

// res.on("finish") 로 건 콜백을 응답이 끝나는 시점에 부른다.
async function call(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  opts: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const finish: (() => void)[] = [];
  const res = {
    statusCode: 200,
    req: { headers: opts.headers ?? {} },
    on(event: string, cb: () => void) {
      if (event === "finish") finish.push(cb);
      return res;
    },
    setHeader: () => undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json() {
      return res;
    },
    end() {
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: opts.method ?? "POST",
      url: opts.url ?? "/api/thing",
      headers: {
        authorization: "Bearer secret-token",
        ...opts.headers,
      },
      query: {},
      body: { email: "a@b.c" },
    } as unknown as VercelRequest,
    res,
  );
  for (const cb of finish) cb();
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "u1", email: "u1@t.local" };
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("defineHandler 요청 로그", () => {
  test("응답이 끝나면 정해진 키만 가진 JSON 한 줄을 남긴다", async () => {
    await call(route("user"), {
      url: "/api/thing?email=a@b.c&token=zzz",
      headers: { "x-vercel-id": "icn1::req-1" },
    });

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0]?.[0] as string);
    expect(Object.keys(line).sort()).toEqual([
      "durationMs",
      "method",
      "requestId",
      "route",
      "status",
      "userId",
    ]);
    expect(line).toMatchObject({
      requestId: "icn1::req-1",
      route: "/api/thing",
      method: "POST",
      status: 201,
      userId: "u1",
    });
    expect(Number.isInteger(line.durationMs)).toBe(true);
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("토큰, 이메일, 쿼리는 줄 어디에도 없다", async () => {
    await call(route("user"), { url: "/api/thing?email=a@b.c" });

    const text = log.mock.calls[0]?.[0] as string;
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("a@b.c");
    expect(text).not.toContain("u1@t.local");
  });

  test("헤더와 유저가 없으면 requestId 와 userId 는 null", async () => {
    await call(route("none"));

    const line = JSON.parse(log.mock.calls[0]?.[0] as string);
    expect(line.requestId).toBeNull();
    expect(line.userId).toBeNull();
  });

  test("405 와 미처리 500 도 한 줄씩 남기고 console.error 는 유지된다", async () => {
    await call(route("none"), { method: "GET" });
    expect(JSON.parse(log.mock.calls[0]?.[0] as string).status).toBe(405);

    log.mockClear();
    await call(
      route("none", async () => {
        throw new Error("boom");
      }),
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]?.[0] as string).status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});
