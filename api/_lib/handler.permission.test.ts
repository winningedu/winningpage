// auth:"admin" 라우트의 메뉴 권한 옵션(permission)을 검증한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./console/consoleTestKit.js";
import type { ErrorShape } from "./httpResponse.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  hqTenantAdmin: true,
}));

vi.mock("./supabaseAdmin.js", () => ({
  getEnv: () => "schoolmentor",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../src/config/sites.js", () => ({
  SITES: {
    schoolmentor: {
      features: {
        get hqTenantAdmin() {
          return kit.hqTenantAdmin;
        },
      },
    },
  },
}));

import { defineHandler } from "./handler.js";

type Permission = Parameters<typeof defineHandler>[0]["permission"];

// problem 바디는 res.end 로 나가므로 json 과 end 를 모두 받는 가짜 res 로 부른다.
async function callHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  body: unknown,
  method: string,
  query: Record<string, string> = {},
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
    { method, headers, query, body } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

function route(permission: Permission, errorShape: ErrorShape = "problem") {
  return defineHandler({
    methods: ["GET", "POST"],
    auth: "admin",
    errorShape,
    unhandledMessage: "처리하지 못했어요.",
    ...(permission ? { permission } : {}),
    handler: async (_req, res) => {
      res.status(200).json({ id: "r1" });
    },
  });
}

function grant(rows: { resource_key: string; level: string }[]) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: rows,
    error: null,
  });
}

function code(body: unknown) {
  return (body as { code?: string }).code;
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.hqTenantAdmin = true;
});

describe("메뉴 권한 수준", () => {
  test("view 권한으로 GET 은 통과한다", async () => {
    grant([{ resource_key: "members", level: "view" }]);
    const r = await callHandler(route({ key: "members" }), undefined, "GET");
    expect(r.status).toBe(200);
  });

  test("view 권한으로 POST 는 403 FORBIDDEN 이다", async () => {
    grant([{ resource_key: "members", level: "view" }]);
    const r = await callHandler(route({ key: "members" }), {}, "POST");
    expect(r.status).toBe(403);
    expect(code(r.body)).toBe("FORBIDDEN");
  });

  test("edit 권한은 GET 과 POST 모두 통과한다", async () => {
    grant([{ resource_key: "members", level: "edit" }]);
    expect(
      (await callHandler(route({ key: "members" }), undefined, "GET")).status,
    ).toBe(200);
    expect(
      (await callHandler(route({ key: "members" }), {}, "POST")).status,
    ).toBe(200);
  });

  test("level 을 지정하면 GET 도 그 수준을 요구한다", async () => {
    grant([{ resource_key: "members", level: "view" }]);
    const r = await callHandler(
      route({ key: "members", level: "edit" }),
      undefined,
      "GET",
    );
    expect(r.status).toBe(403);
  });

  test("권한 행이 없으면 403 이다", async () => {
    grant([{ resource_key: "coupons", level: "edit" }]);
    const r = await callHandler(route({ key: "members" }), undefined, "GET");
    expect(r.status).toBe(403);
    expect(code(r.body)).toBe("FORBIDDEN");
  });

  test("none 행은 403 이다", async () => {
    grant([{ resource_key: "members", level: "none" }]);
    const r = await callHandler(route({ key: "members" }), undefined, "GET");
    expect(r.status).toBe(403);
  });

  test("권한 조회가 실패하면 500 INTERNAL_ERROR 다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: { message: "boom" },
    });
    const r = await callHandler(route({ key: "members" }), undefined, "GET");
    expect(r.status).toBe(500);
    expect(code(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("경로 파라미터 키", () => {
  const byParam = route({
    key: (req: VercelRequest) => String(req.query.key ?? ""),
  });

  test("요청에서 뽑은 키로 판정한다", async () => {
    grant([{ resource_key: "banners", level: "view" }]);
    expect(
      (await callHandler(byParam, undefined, "GET", { key: "banners" })).status,
    ).toBe(200);
    expect(
      (await callHandler(byParam, undefined, "GET", { key: "popups" })).status,
    ).toBe(403);
  });
});

describe("별칭 메뉴", () => {
  test("hqTenantAdmin 이 켜져 있으면 tenants 권한을 본다", async () => {
    grant([{ resource_key: "tenants", level: "edit" }]);
    const r = await callHandler(route({ key: "memberPurge" }), {}, "POST");
    expect(r.status).toBe(200);
  });

  test("hqTenantAdmin 이 꺼져 있으면 tenants 권한이 있어도 403 이다", async () => {
    kit.hqTenantAdmin = false;
    grant([{ resource_key: "tenants", level: "edit" }]);
    const r = await callHandler(
      route({ key: "memberPurgeLogs" }),
      undefined,
      "GET",
    );
    expect(r.status).toBe(403);
  });
});

describe("최고 관리자 전용 메뉴", () => {
  test("최고 관리자는 통과한다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
    const r = await callHandler(route({ key: "adminMembers" }), {}, "POST");
    expect(r.status).toBe(200);
  });

  test("최고 관리자가 아니면 개별 edit 권한이 있어도 403 이다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({ data: false, error: null });
    grant([{ resource_key: "adminRoles", level: "edit" }]);
    const r = await callHandler(route({ key: "adminRoles" }), undefined, "GET");
    expect(r.status).toBe(403);
    expect(code(r.body)).toBe("FORBIDDEN");
  });

  test("최고 관리자 판정이 실패하면 500 이다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({
      data: null,
      error: { message: "boom" },
    });
    const r = await callHandler(
      route({ key: "adminMembers" }),
      undefined,
      "GET",
    );
    expect(r.status).toBe(500);
  });
});

describe("QA 계정", () => {
  // 권한 조회는 관리자 판정과 함께 시작하지만 응답은 QA 차단이 앞선다(handler.parallel.test.ts).
  test("쓰기는 권한이 있어도 QA 차단 403 이다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "profile-1" });
    grant([{ resource_key: "members", level: "edit" }]);
    const r = await callHandler(route({ key: "members" }), {}, "POST");
    expect(r.status).toBe(403);
    expect(code(r.body)).toBe("QA_ACCOUNT_READ_ONLY");
  });
});

describe("errorShape", () => {
  const shapes: ErrorShape[] = [
    "detail",
    "okDetail",
    "error",
    "coded",
    "problem",
  ];

  test.each(shapes)("%s 에서도 권한 없음은 403 이다", async (shape) => {
    grant([]);
    const r = await callHandler(
      route({ key: "members" }, shape),
      undefined,
      "GET",
    );
    expect(r.status).toBe(403);
  });

  test.each(shapes)(
    "%s: 옵션이 없는 라우트는 권한을 조회하지 않는다",
    async (shape) => {
      const r = await callHandler(route(undefined, shape), {}, "POST");
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ id: "r1" });
      expect(kit.state.events).not.toContain(
        "rpc:fn_admin_effective_permissions",
      );
    },
  );
});

test("auth 가 admin 이 아니면 정의할 때 던진다", () => {
  expect(() =>
    defineHandler({
      methods: ["GET"],
      auth: "user",
      errorShape: "problem",
      unhandledMessage: "x",
      permission: { key: "members" },
      handler: async () => {},
    }),
  ).toThrow();
});
