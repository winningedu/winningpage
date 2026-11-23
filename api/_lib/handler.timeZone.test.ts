// defineHandler 가 X-Time-Zone 헤더를 ctx.timeZone 으로 옮기고, 잘못된 값은 400 으로 막는지 검증한다.

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

import { defineHandler, type HandlerCtx, requireTimeZone } from "./handler.js";

let seen: {
  timeZone: string | undefined;
  required?: string | undefined;
} | null;

function route(
  auth: "none" | "user" | "admin" | "winningAdmin" | "cron" | "console",
  errorShape: "detail" | "coded" = "coded",
  useRequire = false,
) {
  return defineHandler({
    methods: ["GET"],
    auth,
    errorShape,
    unhandledMessage: "실패",
    handler: async (_req, res, ctx: HandlerCtx) => {
      seen = {
        timeZone: ctx.timeZone,
        required: useRequire ? requireTimeZone(ctx) : undefined,
      };
      res.status(200).json({ ok: true });
    },
  });
}

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  headers: Record<string, string>,
) {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => undefined,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer token", ...headers },
      query: {},
    } as unknown as VercelRequest,
    res,
  );
  return out;
}

beforeEach(() => {
  kit.state = createKitState();
  seen = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("defineHandler X-Time-Zone", () => {
  test("유효한 헤더는 ctx.timeZone 이 된다", async () => {
    const r = await call(route("user"), { "x-time-zone": "Asia/Seoul" });

    expect(r.status).toBe(200);
    expect(seen?.timeZone).toBe("Asia/Seoul");
  });

  test("헤더가 없으면 ctx.timeZone 은 undefined 이고 라우트는 실행된다", async () => {
    const r = await call(route("none"), {});

    expect(r.status).toBe(200);
    expect(seen?.timeZone).toBeUndefined();
  });

  test.each([
    "none",
    "user",
    "admin",
    "winningAdmin",
    "cron",
    "console",
  ] as const)(
    "auth %s 에서 잘못된 헤더는 400 INVALID_TIME_ZONE",
    async (auth) => {
      for (const bad of ["KST", "+09:00"]) {
        const r = await call(route(auth), { "x-time-zone": bad });

        expect(r.status).toBe(400);
        expect(r.body).toMatchObject({ error: { code: "INVALID_TIME_ZONE" } });
      }
      expect(seen).toBeNull();
    },
  );

  test("errorShape 에 맞춰 잘못된 헤더를 알린다", async () => {
    const r = await call(route("user", "detail"), { "x-time-zone": "KST" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: expect.any(String) });
  });

  test("requireTimeZone 은 있으면 이름을 돌려준다", async () => {
    const r = await call(route("user", "coded", true), {
      "x-time-zone": "America/Los_Angeles",
    });

    expect(r.status).toBe(200);
    expect(seen?.required).toBe("America/Los_Angeles");
  });

  test("requireTimeZone 은 없으면 400 TIME_ZONE_REQUIRED", async () => {
    const r = await call(route("user", "coded", true), {});

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "TIME_ZONE_REQUIRED" } });
  });
});
