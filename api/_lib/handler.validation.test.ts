// defineHandler 의 zod body/query 검증과 ctx 타입을 검증한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
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

const bodySchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.object({ id: z.number() })),
});

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  input: { body?: unknown; query?: Record<string, unknown> },
) {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    req: { headers: {} },
    setHeader: () => undefined,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    end(payload: string) {
      out.body = JSON.parse(payload);
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer token" },
      query: input.query ?? {},
      body: input.body,
    } as unknown as VercelRequest,
    res,
  );
  return out;
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "u1", email: "u1@t.local" };
});

describe("defineHandler body 검증", () => {
  test("통과하면 파싱된 값이 타입과 함께 ctx.body 로 온다", async () => {
    let seen: string | undefined;
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      body: bodySchema.transform((b) => ({ ...b, name: b.name.trim() })),
      handler: async (_req, res, ctx) => {
        seen = ctx.body.name.toUpperCase();
        res.status(200).json({ ok: true });
      },
    });

    const r = await call(route, { body: { name: " ab ", tags: [] } });

    expect(r.status).toBe(200);
    expect(seen).toBe("AB");
  });

  test("실패하면 400 VALIDATION_FAILED 와 errors(path 는 . 로 이음), 핸들러는 안 불린다", async () => {
    const handler = vi.fn(async () => undefined);
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      body: bodySchema,
      handler,
    });

    const r = await call(route, { body: { name: "", tags: [{ id: "x" }] } });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      title: "Bad Request",
      code: "VALIDATION_FAILED",
    });
    const errors = (r.body as { errors: { path: string; message: string }[] })
      .errors;
    expect(errors.map((e) => e.path).sort()).toEqual(["name", "tags.0.id"]);
    expect(errors.every((e) => typeof e.message === "string")).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  test("problem 이 아닌 shape 도 errors 를 extra 로 싣는다", async () => {
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "detail",
      unhandledMessage: "실패",
      body: bodySchema,
      handler: async () => undefined,
    });

    const r = await call(route, { body: {} });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: expect.any(String),
      errors: expect.any(Array),
    });
  });

  test("인증이 먼저다: 토큰이 틀리면 검증 전에 401", async () => {
    kit.state.user = null;
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      body: bodySchema,
      handler: async () => undefined,
    });

    const r = await call(route, { body: {} });

    expect(r.status).toBe(401);
  });
});

describe("defineHandler query 검증", () => {
  const querySchema = z.object({ page: z.coerce.number().int().min(1) });

  test("통과하면 ctx.query 가 변환된 값이다", async () => {
    let page: number | undefined;
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      query: querySchema,
      handler: async (_req, res, ctx) => {
        page = ctx.query.page;
        res.status(200).json({});
      },
    });

    await call(route, { query: { page: "3" } });

    expect(page).toBe(3);
  });

  test("실패하면 400 VALIDATION_FAILED", async () => {
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      query: querySchema,
      handler: async () => undefined,
    });

    const r = await call(route, { query: { page: "0" } });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "page" }],
    });
  });
});

describe("스키마가 없으면", () => {
  test("검증하지 않고 ctx 에 body 와 query 를 만들지 않는다", async () => {
    let keys: string[] = [];
    const route = defineHandler({
      methods: ["POST"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "실패",
      handler: async (_req, res, ctx) => {
        keys = Object.keys(ctx);
        res.status(200).json({});
      },
    });

    const r = await call(route, { body: "아무거나", query: { a: "1" } });

    expect(r.status).toBe(200);
    expect(keys).not.toContain("body");
    expect(keys).not.toContain("query");
  });
});
