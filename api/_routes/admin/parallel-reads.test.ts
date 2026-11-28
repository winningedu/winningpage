// 서로 기다릴 필요 없는 읽기가 함께 시작하는지, 그래도 응답은 읽기를 차례로 하던 때와 같은지 본다.
// 고른 읽기는 release() 전에는 끝나지 않으므로, 앞 읽기가 끝나야 뒤 읽기를 시작하는 코드는 첫 읽기에서 멈춘다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import {
  type Gate,
  gateReads,
  type ReadTarget,
} from "../../_lib/gatedReads.testkit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  gate: null as unknown as Gate,
  shouldGate: (() => false) as (target: ReadTarget) => boolean,
  site: "winning",
}));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  getEnv: (name: string) => (name === "SITE" ? kit.site : "winning"),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const gated = gateReads(createFakeAdmin(kit.state), kit.shouldGate);
    kit.gate = gated.gate;
    return gated.admin;
  },
}));

import { app } from "../app.js";

const ID = "11111111-1111-4111-8111-111111111111";

const only =
  (...names: string[]) =>
  (target: ReadTarget) =>
    names.includes(`${target.kind}:${target.name}`);

// 관리자 판정이 먼저 읽는 profiles 는 건너뛰고 두 번째 읽기부터 막는다.
const afterAuth = (...names: string[]) => {
  const base = only(...names);
  return (target: ReadTarget) =>
    base(target) && !(target.name === "profiles" && target.nth === 0);
};

/** 요청을 보내고, 막아 둔 읽기가 모두 시작했는지 본 뒤 풀어서 응답을 받는다. */
async function run(request: ReturnType<typeof callRoute>, expected: string[]) {
  await vi.waitFor(() => expect(kit.gate.started.length).toBeGreaterThan(0));
  await kit.gate.settle();
  const started = [...kit.gate.started].sort();
  kit.gate.release();
  const response = await request;
  return { started, expected: [...expected].sort(), response };
}

beforeEach(() => {
  kit.site = "winning";
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [
      { resource_key: "members", level: "edit" },
      { resource_key: "tenants", level: "edit" },
    ],
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("roles/:id", () => {
  const ROLE = {
    id: ID,
    name: "추가",
    description: null,
    is_super: false,
    is_system: false,
    created_at: "2026-11-01",
    updated_at: "2026-11-01",
  };

  beforeEach(() => {
    kit.state.rows.admin_roles = (f) => (f.id === ID ? ROLE : null);
    kit.state.rows.admin_role_permissions = () => [
      { resource_key: "members", level: "edit" },
    ];
    kit.state.rows.admin_resources = (f) =>
      (f.key as string[]).map((key) => ({ key }));
  });

  test("GET 은 묶음과 권한 항목을 함께 읽는다", async () => {
    kit.shouldGate = only("from:admin_roles", "from:admin_role_permissions");

    const { started, expected, response } = await run(
      callRoute(
        { app, path: "/api/admin/roles/:id" },
        { method: "GET", query: { id: ID } },
      ),
      ["from:admin_roles", "from:admin_role_permissions"],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
  });

  test("PUT permissions 는 묶음 확인과 메뉴 키 확인을 함께 읽는다", async () => {
    kit.shouldGate = only("from:admin_roles", "from:admin_resources");

    const { started, expected, response } = await run(
      callRoute(
        { app, path: "/api/admin/roles/:id/permissions" },
        {
          method: "PUT",
          query: { id: ID },
          body: { items: [{ resourceKey: "members", level: "view" }] },
        },
      ),
      ["from:admin_roles", "from:admin_resources"],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
  });

  test("PUT permissions 는 없는 묶음이면 알 수 없는 메뉴 키가 있어도 404 이다", async () => {
    kit.state.rows.admin_roles = () => null;
    kit.state.rows.admin_resources = () => [];
    kit.shouldGate = () => false;

    const response = await callRoute(
      { app, path: "/api/admin/roles/:id/permissions" },
      {
        method: "PUT",
        query: { id: ID },
        body: { items: [{ resourceKey: "unknown", level: "view" }] },
      },
    );

    expect(response.status).toBe(404);
    expect(kit.state.events.filter((e) => /^(delete|insert):/.test(e))).toEqual(
      [],
    );
  });
});

describe("staff/:profileId", () => {
  const MEMBER = {
    profile_id: ID,
    role_id: "22222222-2222-4222-8222-222222222222",
    department: "운영팀",
    status: "active",
    member_name: "김관리",
  };

  beforeEach(() => {
    kit.state.rows.admin_member_directory = (f) =>
      f.profile_id === ID ? MEMBER : null;
    kit.state.rows.admin_member_permissions = () => [
      { resource_key: "members", level: "view" },
    ];
    kit.state.rows.admin_members = (f) =>
      f.profile_id === ID ? { profile_id: ID } : null;
    kit.state.rows.admin_resources = (f) =>
      (f.key as string[]).map((key) => ({ key }));
  });

  test("GET 은 디렉터리 행과 개별 권한과 실효 권한을 함께 읽는다", async () => {
    const effective = "rpc:fn_admin_effective_permissions";
    // 최고 관리자 전용 메뉴라 관리자 판정은 이 rpc 를 부르지 않는다.
    kit.shouldGate = only(
      "from:admin_member_directory",
      "from:admin_member_permissions",
      effective,
    );

    const { started, response } = await run(
      callRoute(
        { app, path: "/api/admin/staff/:profileId" },
        { method: "GET", query: { profileId: ID } },
      ),
      [],
    );

    expect(started).toEqual(
      [
        "from:admin_member_directory",
        "from:admin_member_permissions",
        effective,
      ].sort(),
    );
    expect(response.status).toBe(200);
  });

  test("GET 은 없는 관리자이면 권한 읽기 오류가 있어도 404 이다", async () => {
    kit.state.rows.admin_member_directory = () => null;
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: { message: "읽지 않아야 하는 결과" },
    });
    kit.shouldGate = () => false;

    const response = await callRoute(
      { app, path: "/api/admin/staff/:profileId" },
      { method: "GET", query: { profileId: ID } },
    );

    expect(response.status).toBe(404);
  });

  test("PUT permissions 는 관리자 확인과 메뉴 키 확인을 함께 읽는다", async () => {
    kit.shouldGate = only("from:admin_members", "from:admin_resources");

    const { started, expected, response } = await run(
      callRoute(
        { app, path: "/api/admin/staff/:profileId/permissions" },
        {
          method: "PUT",
          query: { profileId: ID },
          body: { items: [{ resourceKey: "members", level: "view" }] },
        },
      ),
      ["from:admin_members", "from:admin_resources"],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
  });

  test("PUT permissions 는 없는 관리자이면 알 수 없는 메뉴 키가 있어도 404 이다", async () => {
    kit.state.rows.admin_members = () => null;
    kit.state.rows.admin_resources = () => [];
    kit.shouldGate = () => false;

    const response = await callRoute(
      { app, path: "/api/admin/staff/:profileId/permissions" },
      {
        method: "PUT",
        query: { profileId: ID },
        body: { items: [{ resourceKey: "unknown", level: "view" }] },
      },
    );

    expect(response.status).toBe(404);
  });
});

describe("members/:id 하위 읽기", () => {
  const MEMBER = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  beforeEach(() => {
    kit.state.rows.profiles = (f) =>
      f.id === "hq-1"
        ? { role: "admin" }
        : { id: MEMBER, member_type: "student" };
    kit.state.rows.alimtalk_send_logs = () => [];
    kit.state.rows.program_access = () => [];
  });

  test.each([
    ["messages", "from:alimtalk_send_logs"],
    ["services", "from:program_access"],
  ])("%s 는 회원 확인과 목록 읽기를 함께 시작한다", async (path, read) => {
    kit.shouldGate = afterAuth("from:profiles", read);

    const { started, expected, response } = await run(
      callRoute(
        { app, path: `/api/admin/members/:id/${path}` },
        { method: "GET", query: { id: MEMBER } },
      ),
      ["from:profiles", read],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
  });

  test("없는 회원이면 목록 읽기를 기다리지 않고 404 이다", async () => {
    kit.state.rows.profiles = (f) =>
      f.id === "hq-1" ? { role: "admin" } : null;
    kit.state.rows.alimtalk_send_logs = () => [];
    kit.shouldGate = () => false;

    const response = await callRoute(
      { app, path: "/api/admin/members/:id/messages" },
      { method: "GET", query: { id: MEMBER } },
    );

    expect(response.status).toBe(404);
  });
});

describe("tenants", () => {
  test("GET 은 기관 목록과 유예일 설정을 함께 읽는다", async () => {
    kit.state.rows.tenants = () => [];
    kit.state.rows.app_settings = () => ({ value: 30 });
    kit.shouldGate = only("from:tenants", "from:app_settings");

    const { started, expected, response } = await run(
      callRoute({ app, path: "/api/admin/tenants" }, { method: "GET" }),
      ["from:tenants", "from:app_settings"],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ graceDays: 30 });
  });
});

describe("tenants/student-usage", () => {
  const STUDENT = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
  const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
  const route = { app, path: "/api/admin/tenants/student-usage" };

  beforeEach(() => {
    kit.site = "schoolmentor";
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [
        { resource_key: "serviceCreditAdjust", level: "view" },
        { resource_key: "tenants", level: "view" },
      ],
      error: null,
    });
    kit.state.rpc.fn_tenant_usage_state = () => ({ data: [], error: null });
    kit.state.rows.profiles = (f) =>
      f.id === "hq-1" ? { role: "admin" } : { id: STUDENT, tenant_id: TENANT };
    kit.state.rows.tenants = () => ({
      id: TENANT,
      name: "한빛고",
      is_catch_all: false,
    });
    kit.state.rows.tenant_service_settings = () => [];
    kit.state.rows.student_usage_overrides = () => [];
  });

  test("학생 확인과 함께 개별 조정과 사용 상태를 읽는다", async () => {
    kit.shouldGate = afterAuth(
      "from:profiles",
      "from:student_usage_overrides",
      "rpc:fn_tenant_usage_state",
    );

    const { started, response } = await run(
      callRoute(route, { method: "GET", query: { profileId: STUDENT } }),
      [],
    );

    expect([...new Set(started)]).toEqual([
      "from:profiles",
      "from:student_usage_overrides",
      "rpc:fn_tenant_usage_state",
    ]);
    expect(response.status).toBe(200);
  });

  test("기관 읽기와 기관 설정 읽기를 함께 시작한다", async () => {
    kit.shouldGate = only("from:tenants", "from:tenant_service_settings");

    const { started, expected, response } = await run(
      callRoute(route, { method: "GET", query: { profileId: STUDENT } }),
      ["from:tenants", "from:tenant_service_settings"],
    );

    expect(started).toEqual(expected);
    expect(response.status).toBe(200);
  });

  test("없는 학생이면 사용 상태 읽기 오류가 있어도 404 이다", async () => {
    kit.state.rows.profiles = (f) =>
      f.id === "hq-1" ? { role: "admin" } : null;
    kit.state.rpc.fn_tenant_usage_state = () => ({
      data: null,
      error: { message: "읽지 않아야 하는 결과" },
    });
    kit.shouldGate = () => false;

    const response = await callRoute(route, {
      method: "GET",
      query: { profileId: STUDENT },
    });

    expect(response.status).toBe(404);
  });
});
