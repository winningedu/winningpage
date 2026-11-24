// GET, PUT /api/admin/home-section-copy/:sectionKey 계약 검증. 섹션 키마다 메뉴 권한이 다르고,
// 모르는 키는 권한 판정이나 DB 읽기 전에 400 으로 막는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./[sectionKey].js";

const call = (method: string, sectionKey: string, body?: unknown) =>
  callHandler(handler, body, method, { sectionKey });

let permissionLookups: number;
let copyReads: number;

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => {
    permissionLookups += 1;
    return { data: [{ resource_key, level }], error: null };
  };
}

const ROW = {
  section_key: "services",
  eyebrow: "라벨",
  title_main: "큰제목",
  title_sub: "중제목",
};

beforeEach(() => {
  permissionLookups = 0;
  copyReads = 0;
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.home_section_copy = () => {
    copyReads += 1;
    return ROW;
  };
  grant("programCategories", "edit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/home-section-copy/:sectionKey", () => {
  test("저장된 행을 그대로 돌려준다", async () => {
    const r = await call("GET", "services");

    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
  });

  test("행이 아직 없으면 404 NOT_FOUND", async () => {
    kit.state.rows.home_section_copy = () => null;

    const r = await call("GET", "services");

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("모르는 섹션 키는 권한 조회와 DB 읽기 전에 400 VALIDATION_FAILED", async () => {
    const r = await call("GET", "nope");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(permissionLookups).toBe(0);
    expect(copyReads).toBe(0);
  });

  test("섹션마다 그 메뉴의 보기 권한을 본다", async () => {
    grant("programCategories", "view");

    expect((await call("GET", "services")).status).toBe(200);
    expect((await call("GET", "mentor")).status).toBe(403);
    expect((await call("GET", "acceptance")).status).toBe(403);
  });
});

describe("PUT /api/admin/home-section-copy/:sectionKey", () => {
  const body = { eyebrow: "라벨", title_main: " 새 큰제목 ", title_sub: null };
  const upserts = () => kit.state.upserts;

  test("섹션 키 기준으로 upsert 하고 저장한 행을 돌려준다", async () => {
    const r = await call("PUT", "services", body);

    expect(r.status).toBe(200);
    const saved = {
      section_key: "services",
      eyebrow: "라벨",
      title_main: "새 큰제목",
      title_sub: null,
    };
    expect(r.body).toEqual(saved);
    expect(upserts()).toEqual([
      { table: "home_section_copy", row: saved, onConflict: "section_key" },
    ]);
  });

  test("라벨이 없는 acceptance 는 eyebrow 를 보내도 null 로 저장한다", async () => {
    grant("universityAcceptances", "edit");

    const r = await call("PUT", "acceptance", body);

    expect(r.status).toBe(200);
    expect(upserts()[0]?.row.eyebrow).toBeNull();
  });

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("programCategories", "view");

    const r = await call("PUT", "services", body);

    expect(r.status).toBe(403);
    expect(upserts()).toHaveLength(0);
  });

  test("모르는 섹션 키는 400 이고 쓰지 않는다", async () => {
    const r = await call("PUT", "nope", body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(upserts()).toHaveLength(0);
  });

  test.each([
    [{ ...body, title_main: "   " }],
    [{ ...body, title_main: undefined }],
    [{ eyebrow: "a", title_main: "b" }],
  ])("큰제목이 비었거나 모양이 틀린 본문 %j 은 400", async (bad) => {
    const r = await call("PUT", "services", bad);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(upserts()).toHaveLength(0);
  });
});
