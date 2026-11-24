// GET /api/admin/tenant-options 계약 검증. 배너 노출 대상 select 가 쓰는 소속 목록이다.
// 경계는 예전 tenants select RLS 와 같은 tenants 보기 권한이다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./tenant-options.js";

const get = () => callHandler(handler, undefined, "GET");

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.tenants = () => [
    { id: "t-1", name: "가 학원", org_type: "academy", is_catch_all: false },
    { id: "t-2", name: "나 학원", org_type: "school", is_catch_all: true },
  ];
  grant("tenants", "view");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenant-options", () => {
  test("id, 이름, 기관 유형, 기타 여부를 이름순으로 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          id: "t-1",
          name: "가 학원",
          org_type: "academy",
          is_catch_all: false,
        },
        { id: "t-2", name: "나 학원", org_type: "school", is_catch_all: true },
      ],
    });
    expect(kit.state.orders).toEqual([{ table: "tenants", column: "name" }]);
    expect(kit.state.reads.find((x) => x.table === "tenants")?.select).toBe(
      "id, name, org_type, is_catch_all",
    );
  });

  test("배너 수정 권한만 있고 tenants 권한이 없으면 403 이고 읽지 않는다", async () => {
    grant("banners", "edit");

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.reads.some((x) => x.table === "tenants")).toBe(false);
  });
});
