// GET /api/console/me 계약 검증. 콘솔 셸이 역할, 기관, 대행 배너, 임시 비밀번호 상태를 한 번에 읽는다.

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

import handler from "./me.js";

const get = () => callHandler(handler, undefined, "GET");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = {
    kind: "homeroom",
    tenant_id: "tenant-1",
    teacher_id: "teacher-1",
    class_ids: ["class-1", "class-2"],
    proxy_session_id: null,
    must_change_password: false,
  };
  kit.state.rows.teachers = () => ({
    id: "teacher-1",
    login_id: "ABCD2345XY7Z9K",
    name: "김담임",
    role: "homeroom",
  });
  kit.state.rows.tenants = () => ({
    id: "tenant-1",
    code: "SCHOOL001",
    name: "한빛중학교",
  });
  kit.state.rows.teacher_class_assignments = () => [
    { class_id: "class-1", is_primary: true },
    { class_id: "class-2", is_primary: false },
  ];
  kit.state.rows.classes = () => [
    { id: "class-2", grade: "고2", name: "5", group_id: null },
    { id: "class-1", grade: "고2", name: "3", group_id: "group-1" },
  ];
  kit.state.rows.class_groups = () => [{ id: "group-1", name: "A그룹" }];
  kit.state.rows.proxy_sessions = () => ({
    id: "session-1",
    expires_at: "2026-11-06T09:00:00Z",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/console/me", () => {
  test("교사는 역할, 기관, 교사 정보, 담당 학급, 임시 비밀번호 상태를 받고 대행 정보는 없다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      kind: "homeroom",
      tenant: { id: "tenant-1", code: "SCHOOL001", name: "한빛중학교" },
      teacher: {
        id: "teacher-1",
        loginId: "ABCD2345XY7Z9K",
        name: "김담임",
        role: "homeroom",
      },
      classIds: ["class-1", "class-2"],
      classes: [
        {
          id: "class-2",
          grade: "고2",
          name: "5",
          group: null,
          isPrimary: false,
        },
        {
          id: "class-1",
          grade: "고2",
          name: "3",
          group: "A그룹",
          isPrimary: true,
        },
      ],
      proxySession: null,
      mustChangePassword: false,
    });
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });

  test("학교 전체 관리자는 담당 학급 목록이 비어 있고 학급을 조회하지 않는다", async () => {
    kit.state.actor = {
      ...kit.state.actor,
      kind: "school_admin",
      class_ids: [],
    };
    kit.state.rows.classes = () => {
      throw new Error("classes must not be read");
    };

    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ classes: [] });
  });

  test("본사 대행 세션이면 교사 없이 대행 세션 id, 기관명, 만료 시각을 돌려준다", async () => {
    kit.state.actor = {
      kind: "hq_proxy",
      tenant_id: "tenant-1",
      teacher_id: null,
      class_ids: [],
      proxy_session_id: "session-1",
      must_change_password: false,
    };

    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      kind: "hq_proxy",
      teacher: null,
      proxySession: {
        id: "session-1",
        tenantName: "한빛중학교",
        expiresAt: "2026-11-06T09:00:00Z",
      },
    });
  });

  test("임시 비밀번호 상태의 교사도 읽을 수 있고 mustChangePassword 가 true 다", async () => {
    kit.state.actor = { ...kit.state.actor, must_change_password: true };

    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mustChangePassword: true });
  });

  test("GET 이 아니면 405", async () => {
    const r = await callHandler(handler, {}, "POST");

    expect(r.status).toBe(405);
  });

  test("기관 조회가 비어 있으면 500 이고 값을 만들어 내지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rows.tenants = () => null;

    const r = await get();

    expect(r.status).toBe(500);
  });
});
