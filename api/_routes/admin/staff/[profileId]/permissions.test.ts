// PUT /api/admin/staff/:profileId/permissions 계약 검증. 개별 권한을 지우고 다시 넣는다(옛 화면과 같다).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../_lib/supabaseAdmin.js")
  >()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./permissions.js";

const P = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const ITEMS = [
  { resourceKey: "members", level: "view" },
  { resourceKey: "tenants", level: "edit" },
];

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
}

const put = (body: unknown, id: string = P) =>
  callHandler(handler, body, "PUT", { profileId: id });

const writes = () =>
  kit.state.events.filter((e) => /^(delete|insert|update|upsert):/.test(e));

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admin_members = (f) =>
    f.profile_id === P ? { profile_id: P } : null;
  kit.state.rows.admin_resources = (f) =>
    (f.key as string[]).filter((key) => ["members", "tenants"].includes(key))
      .length > 0
      ? (f.key as string[])
          .filter((key) => ["members", "tenants"].includes(key))
          .map((key) => ({ key }))
      : [];
  superAdmin(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/admin/staff/:profileId/permissions", () => {
  test("최고 관리자가 아니면 403 이고 쓰지 않는다", async () => {
    superAdmin(false);

    const r = await put({ items: ITEMS });

    expect(r.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  test("QA 관리자는 쓰기가 막힌다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await put({ items: ITEMS });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "QA_ACCOUNT_READ_ONLY" });
    expect(writes()).toEqual([]);
  });

  test("지운 뒤 profile_id, resource_key, level 만 넣고 저장한 목록을 돌려준다", async () => {
    const r = await put({ items: ITEMS });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: ITEMS });
    expect(r.body).not.toHaveProperty("ok");
    expect(writes()).toEqual([
      "delete:admin_member_permissions",
      "insert:admin_member_permissions",
    ]);
    expect(kit.state.deletes).toEqual([
      { table: "admin_member_permissions", filters: { profile_id: P } },
    ]);
    expect(kit.state.inserts).toEqual([
      {
        table: "admin_member_permissions",
        row: [
          { profile_id: P, resource_key: "members", level: "view" },
          { profile_id: P, resource_key: "tenants", level: "edit" },
        ],
      },
    ]);
  });

  test("빈 목록이면 지우기만 한다", async () => {
    const r = await put({ items: [] });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
    expect(writes()).toEqual(["delete:admin_member_permissions"]);
  });

  test("없는 관리자는 404 이고 쓰지 않는다", async () => {
    const r = await put(
      { items: ITEMS },
      "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c",
    );

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(writes()).toEqual([]);
  });

  test("모르는 메뉴 키는 400 이고 쓰지 않는다", async () => {
    const r = await put({
      items: [...ITEMS, { resourceKey: "nope", level: "view" }],
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "items.2.resourceKey" }],
    });
    expect(writes()).toEqual([]);
  });

  test.each([
    ["body 없음", undefined],
    ["items 없음", {}],
    ["모르는 키", { items: ITEMS, profileId: "x" }],
    ["항목의 모르는 키", { items: [{ ...ITEMS[0], granted_by: "x" }] }],
    ["잘못된 level", { items: [{ resourceKey: "members", level: "admin" }] }],
    ["빈 resourceKey", { items: [{ resourceKey: "", level: "view" }] }],
    ["중복 resourceKey", { items: [ITEMS[0], ITEMS[0]] }],
    [
      "201개",
      {
        items: Array.from({ length: 201 }, (_, i) => ({
          resourceKey: `k${i}`,
          level: "view",
        })),
      },
    ],
  ])("%s 는 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await put(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(writes()).toEqual([]);
  });

  test("uuid 가 아닌 경로 id 는 400", async () => {
    const r = await put({ items: ITEMS }, "nope");

    expect(r.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  test.each([
    ["지우기", "deleteErrors"],
    ["넣기", "insertErrors"],
  ] as const)(
    "%s 가 실패하면 500 이고 원문을 싣지 않는다",
    async (_label, bag) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      kit.state[bag].admin_member_permissions = { message: "secret 홍길동" };

      const r = await put({ items: ITEMS });

      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toContain("홍길동");
    },
  );
});
