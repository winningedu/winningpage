// RouteParamError: 경로 파라미터 오류를 zod 검증 실패와 같은 400 으로 응답한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./console/consoleTestKit.js";
import type { ErrorShape } from "./httpResponse.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("./supabaseAdmin.js", () => ({
  getEnv: () => "schoolmentor",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { defineHandler, RouteParamError } from "./handler.js";

async function callHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  const out = { status: 0, body: undefined as unknown };
  const headers = { authorization: "Bearer token" };
  const res = {
    req: { headers },
    setHeader: () => res,
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
  };
  await handler(
    { method: "GET", headers, query: {} } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

const expected400 = {
  errors: [{ path: "key", message: "알 수 없는 메뉴예요." }],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
});

describe.each<ErrorShape>(["problem", "coded"])(
  "RouteParamError (%s)",
  (shape) => {
    test("권한 키 함수가 던지면 400 VALIDATION_FAILED 이고 권한 rpc 를 부르지 않는다", async () => {
      const handler = defineHandler({
        methods: ["GET"],
        auth: "admin",
        errorShape: shape,
        unhandledMessage: "처리하지 못했어요.",
        permission: {
          key: () => {
            throw new RouteParamError("key", "알 수 없는 메뉴예요.");
          },
        },
        handler: async (_req, res) => {
          res.status(200).json({});
        },
      });

      const r = await callHandler(handler);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject(expected400);
      if (shape === "problem") {
        expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
      }
      expect(
        kit.state.events.filter(
          (e) =>
            e.startsWith("rpc:fn_admin_effective") ||
            e === "rpc:fn_is_super_admin",
        ),
      ).toEqual([]);
    });

    test("핸들러가 던져도 같은 400 이다", async () => {
      const handler = defineHandler({
        methods: ["GET"],
        auth: "admin",
        errorShape: shape,
        unhandledMessage: "처리하지 못했어요.",
        handler: async () => {
          throw new RouteParamError("key", "알 수 없는 메뉴예요.");
        },
      });

      const r = await callHandler(handler);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject(expected400);
    });
  },
);

test("다른 에러는 그대로 500 이다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = defineHandler({
    methods: ["GET"],
    auth: "admin",
    errorShape: "problem",
    unhandledMessage: "처리하지 못했어요.",
    handler: async () => {
      throw new Error("boom");
    },
  });

  const r = await callHandler(handler);

  expect(r.status).toBe(500);
});
