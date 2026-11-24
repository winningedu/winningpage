// auth:"admin" 라우트의 쓰기와 조회(GET) 요청이 admin_access_logs 에 감사 행을 자동으로 남기는지 검증한다.

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
  scheduled: [] as Promise<unknown>[],
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

// 예약된 작업을 모아 두었다가 테스트가 끝까지 기다린다.
vi.mock("./afterResponse.js", () => ({
  scheduleAfterResponse: (work: () => Promise<unknown>) => {
    kit.scheduled.push(work());
  },
}));

// vitest.setup.ts 가 기본으로 끈 실제 적재 모듈을 쓴다.
vi.unmock("./accessLog/adminWrite.js");

import { defineHandler } from "./handler.js";

type Options = Parameters<typeof defineHandler>[0];

const UUID = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";

interface CallInput {
  method: string;
  url?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

async function call(
  handler: ReturnType<typeof defineHandler>,
  input: CallInput,
) {
  const out = { status: 0, body: undefined as unknown };
  const headers = {
    authorization: "Bearer token",
    ...(input.headers ?? {}),
  };
  const res = {
    statusCode: 200,
    req: { headers },
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      res.statusCode = code;
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
    {
      method: input.method,
      url: input.url ?? "/api/admin/things",
      headers,
      query: input.query ?? {},
      body: input.body,
    } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  await Promise.all(kit.scheduled);
  return out;
}

function route(
  over: { [K in keyof Options]?: Options[K] | undefined } = {},
  handler: Options["handler"] = async (_req, res) => {
    res.status(200).json({ id: "r1" });
  },
  errorShape: ErrorShape = "problem",
) {
  const options = {
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    auth: "admin",
    errorShape,
    unhandledMessage: "처리하지 못했어요.",
    permission: { key: "members" },
    handler,
    ...over,
  } as Options;
  // undefined 로 넘긴 옵션은 없는 것으로 본다(permission 없는 라우트).
  if (options.permission === undefined) delete options.permission;
  return defineHandler(options);
}

function grant(rows: { resource_key: string; level: string }[]) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: rows,
    error: null,
  });
}

function auditRows() {
  return kit.state.inserts
    .filter((i) => i.table === "admin_access_logs")
    .map((i) => i.row);
}

function auditMeta(): Record<string, unknown> {
  return (auditRows()[0]?.meta ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.user = { id: "admin-1", email: "boss@example.com" };
  kit.hqTenantAdmin = true;
  kit.scheduled = [];
  grant([{ resource_key: "members", level: "edit" }]);
});

describe("동작 기본값", () => {
  test("POST 는 create 감사 행을 남긴다", async () => {
    const r = await call(route(), {
      method: "POST",
      url: "/api/admin/things?x=1",
      headers: { "x-vercel-id": "icn1::abc", "x-forwarded-for": "203.0.113.7" },
    });
    expect(r.status).toBe(200);
    expect(auditRows()).toEqual([
      {
        profile_id: "admin-1",
        actor_email: "boss@example.com",
        actor_kind: "hq",
        action: "create",
        resource_key: "members",
        target_id: null,
        reason: null,
        row_count: null,
        meta: {
          route: "/api/admin/things",
          method: "POST",
          status: 200,
          requestId: "icn1::abc",
          ip: "203.0.113.7",
        },
      },
    ]);
  });

  test.each([
    ["PATCH", "update"],
    ["PUT", "update"],
    ["DELETE", "delete"],
  ])("%s 는 %s 로 남긴다", async (method, action) => {
    await call(route(), { method });
    expect(auditRows().map((r) => r.action)).toEqual([action]);
  });
});

describe("종료 경로마다 한 줄", () => {
  test("권한이 없어 403 이어도 남긴다", async () => {
    grant([{ resource_key: "members", level: "view" }]);
    const r = await call(route(), { method: "POST" });
    expect(r.status).toBe(403);
    expect(auditRows()).toHaveLength(1);
    expect(auditMeta().status).toBe(403);
  });

  test("핸들러가 보낸 409 도 남긴다", async () => {
    const r = await call(
      route({}, async (_req, res) => {
        res.status(409).json({ code: "CONFLICT" });
      }),
      { method: "POST" },
    );
    expect(r.status).toBe(409);
    expect(auditMeta().status).toBe(409);
  });

  test("핸들러가 던져 500 이어도 남긴다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call(
      route({}, async () => {
        throw new Error("boom");
      }),
      { method: "PATCH" },
    );
    expect(r.status).toBe(500);
    expect(auditMeta().status).toBe(500);
  });

  test("검증 실패 400 도 남긴다", async () => {
    const { z } = await import("zod");
    const r = await call(route({ body: z.object({ name: z.string() }) }), {
      method: "POST",
      body: {},
    });
    expect(r.status).toBe(400);
    expect(auditMeta().status).toBe(400);
  });

  test("권한 키 함수가 던진 400 은 대상 메뉴가 없어 남기지 않는다", async () => {
    const { RouteParamError } = await import("./handler.js");
    const r = await call(
      route({
        permission: {
          key: () => {
            throw new RouteParamError("key", "모르는 메뉴");
          },
        },
      }),
      { method: "POST" },
    );
    expect(r.status).toBe(400);
    expect(auditRows()).toEqual([]);
  });
});

describe("조회(GET)", () => {
  test("목록 GET 은 대상 없이 view 행을 남기고 route 에 쿼리를 싣지 않는다", async () => {
    const r = await call(route(), {
      method: "GET",
      url: "/api/admin/members?q=홍길동&page=2",
      query: { q: "홍길동", page: "2" },
      headers: {
        "x-vercel-id": "icn1::get",
        "x-forwarded-for": "198.51.100.4",
      },
    });
    expect(r.status).toBe(200);
    expect(auditRows()).toEqual([
      {
        profile_id: "admin-1",
        actor_email: "boss@example.com",
        actor_kind: "hq",
        action: "view",
        resource_key: "members",
        target_id: null,
        reason: null,
        row_count: null,
        meta: {
          route: "/api/admin/members",
          method: "GET",
          status: 200,
          requestId: "icn1::get",
          ip: "198.51.100.4",
        },
      },
    ]);
  });

  test("상세 GET 은 경로의 uuid 를 target_id 로 남긴다", async () => {
    await call(route(), {
      method: "GET",
      url: `/api/admin/members/${UUID}`,
      query: { id: UUID },
    });
    expect(auditRows()[0]).toMatchObject({ action: "view", target_id: UUID });
  });

  test("view 권한도 없어 403 인 GET 도 남긴다", async () => {
    grant([]);
    const r = await call(route(), { method: "GET" });
    expect(r.status).toBe(403);
    expect(auditRows()).toHaveLength(1);
    expect(auditMeta().status).toBe(403);
  });

  test("핸들러가 보낸 404 GET 도 남긴다", async () => {
    const r = await call(
      route({}, async (_req, res) => {
        res.status(404).json({ code: "NOT_FOUND" });
      }),
      { method: "GET", url: `/api/admin/members/${UUID}`, query: { id: UUID } },
    );
    expect(r.status).toBe(404);
    expect(auditRows()[0]).toMatchObject({ action: "view", target_id: UUID });
    expect(auditMeta().status).toBe(404);
  });

  test("적재가 실패해도 GET 응답은 그대로다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.insertErrors.admin_access_logs = { message: "db down" };
    const r = await call(route(), { method: "GET" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: "r1" });
  });
});

describe("접속지 IP", () => {
  test("x-forwarded-for 의 첫 값을 쓴다", async () => {
    await call(route(), {
      method: "GET",
      headers: { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" },
    });
    expect(auditMeta().ip).toBe("203.0.113.9");
  });

  test("헤더가 없으면 ip 는 null 이고 행은 남는다", async () => {
    const r = await call(route(), { method: "POST" });
    expect(r.status).toBe(200);
    expect(auditMeta()).toHaveProperty("ip", null);
  });

  test("meta 에는 route, method, status, requestId, ip 만 싣는다", async () => {
    await call(route(), {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "203.0.113.9",
      },
      query: { q: "홍길동" },
    });
    expect(Object.keys(auditMeta()).sort()).toEqual([
      "ip",
      "method",
      "requestId",
      "route",
      "status",
    ]);
  });
});

describe("남기지 않는 경우", () => {
  test("HEAD 는 남기지 않는다", async () => {
    await call(route(), { method: "HEAD" });
    expect(auditRows()).toEqual([]);
  });

  test("토큰이 없는 GET 은 401 이고 남기지 않는다", async () => {
    kit.state.user = null;
    const r = await call(route(), { method: "GET" });
    expect(r.status).toBe(401);
    expect(auditRows()).toEqual([]);
  });

  test("audit:false 인 GET 라우트는 남기지 않는다", async () => {
    await call(route({ audit: false }), { method: "GET" });
    expect(auditRows()).toEqual([]);
  });

  test("토큰이 없으면 401 이고 남기지 않는다", async () => {
    kit.state.user = null;
    const r = await call(route(), { method: "POST" });
    expect(r.status).toBe(401);
    expect(auditRows()).toEqual([]);
  });

  test("관리자가 아니면 403 이고 남기지 않는다", async () => {
    kit.state.rows.profiles = () => ({ role: "user" });
    const r = await call(route(), { method: "POST" });
    expect(r.status).toBe(403);
    expect(auditRows()).toEqual([]);
  });

  test("audit:false 라우트는 남기지 않는다", async () => {
    await call(route({ audit: false }), { method: "POST" });
    expect(auditRows()).toEqual([]);
  });

  test("permission 이 없는 라우트는 남기지 않는다", async () => {
    await call(route({ permission: undefined }), { method: "POST" });
    expect(auditRows()).toEqual([]);
  });
});

describe("행위자와 대상", () => {
  test("행위자는 토큰에서 오고 본문의 profile_id, actor_email 은 무시한다", async () => {
    await call(route(), {
      method: "POST",
      body: { profile_id: "evil", actor_email: "evil@example.com" },
    });
    expect(auditRows()[0]).toMatchObject({
      profile_id: "admin-1",
      actor_email: "boss@example.com",
    });
  });

  test("경로 조각에 있는 uuid id 는 target_id 가 된다", async () => {
    await call(route(), {
      method: "PATCH",
      url: `/api/admin/things/${UUID}`,
      query: { id: UUID },
    });
    expect(auditRows()[0]?.target_id).toBe(UUID);
    expect(auditRows()[0]?.meta).not.toHaveProperty("targetId");
  });

  test("profileId 도 같은 규칙으로 target_id 가 된다", async () => {
    await call(route(), {
      method: "DELETE",
      url: `/api/admin/staff/${UUID}`,
      query: { profileId: UUID },
    });
    expect(auditRows()[0]?.target_id).toBe(UUID);
  });

  test("uuid 가 아닌 경로 id 는 meta.targetId 로 가고 target_id 는 비운다", async () => {
    await call(route(), {
      method: "PATCH",
      url: "/api/admin/things/abc-1",
      query: { id: "abc-1" },
    });
    expect(auditRows()[0]?.target_id).toBeNull();
    expect(auditMeta().targetId).toBe("abc-1");
  });

  test("경로에 없는 쿼리 id 는 무시한다", async () => {
    await call(route(), {
      method: "POST",
      url: `/api/admin/things?id=${UUID}`,
      query: { id: UUID },
    });
    expect(auditRows()[0]?.target_id).toBeNull();
    expect(auditRows()[0]?.meta).not.toHaveProperty("targetId");
  });
});

describe("resource_key 와 동작 재정의", () => {
  test("별칭 메뉴는 별칭이 가리키는 키로 남긴다", async () => {
    grant([{ resource_key: "tenants", level: "edit" }]);
    await call(route({ permission: { key: "memberPurge" } }), {
      method: "POST",
    });
    expect(auditRows()[0]?.resource_key).toBe("tenants");
  });

  test("키 함수가 돌려준 값으로 남긴다", async () => {
    grant([{ resource_key: "banners", level: "edit" }]);
    await call(route({ permission: { key: (req) => String(req.query.key) } }), {
      method: "POST",
      query: { key: "banners" },
    });
    expect(auditRows()[0]?.resource_key).toBe("banners");
  });

  test("audit.action 이 메서드 기본값을 덮는다", async () => {
    await call(route({ audit: { action: "view" } }), { method: "POST" });
    expect(auditRows()[0]?.action).toBe("view");
  });
});

describe("적재 실패와 정의 검사", () => {
  test("적재가 실패해도 응답은 그대로이고 요청 id 가 든 오류 한 줄을 남긴다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.insertErrors.admin_access_logs = { message: "db down" };
    const r = await call(route(), {
      method: "POST",
      headers: { "x-vercel-id": "icn1::req-9" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: "r1" });
    const lines = errors.mock.calls.filter((c) =>
      String(c[0]).includes("[admin-audit]"),
    );
    expect(lines).toHaveLength(1);
    expect(String(lines[0]?.[1])).toContain("icn1::req-9");
    errors.mockRestore();
  });

  test("admin 이 아닌 auth 에 audit 을 쓰면 정의 때 던진다", () => {
    expect(() =>
      route({ auth: "user", permission: undefined, audit: false }),
    ).toThrow();
  });
});
