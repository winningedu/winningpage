// POST /api/admin/tenants/move-student 계약 검증(결정 96, 101, 102). 스쿨멘토에서만 열리고, 본사 members edit 권한만,
// 소속과 학적을 함께 옮기는 DB 함수를 부르고, 옮긴 기록을 감사 로그에 남긴다.

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
  getEnv: (name: string) => process.env[name],
}));

import handler from "./move-student.js";

const post = (body: unknown, method = "POST") =>
  callHandler(handler, body, method);

const VALID = {
  profileId: "student-1",
  tenantId: "tenant-9",
  grade: "고2",
  className: "3반",
  number: 7,
};

const moveArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "members", level: "edit" }],
    error: null,
  });
  moveArgs.length = 0;
  kit.state.rpc.fn_admin_move_student_tenant = (args) => {
    moveArgs.push(args);
    return {
      data: [
        {
          from_tenant_id: "tenant-1",
          tenant_id: "tenant-9",
          enrollment_id: "e-1",
        },
      ],
      error: null,
    };
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/admin/tenants/move-student", () => {
  test("위닝에서는 라우트가 없는 것처럼 404 이고 아무것도 옮기지 않는다", async () => {
    vi.stubEnv("SITE", "winning");

    const r = await post(VALID);

    expect(r.status).toBe(404);
    expect(moveArgs).toHaveLength(0);
  });

  test.each([
    ["권한 없음", []],
    ["members view 만", [{ resource_key: "members", level: "view" }]],
    ["다른 리소스 edit", [{ resource_key: "tenants", level: "edit" }]],
  ])("%s 이면 403 이고 아무것도 옮기지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await post(VALID);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(moveArgs).toHaveLength(0);
  });

  test("성공하면 본문의 값으로 이동 함수를 실행자와 함께 부르고 결과를 돌려준다", async () => {
    const r = await post(VALID);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      fromTenantId: "tenant-1",
      tenantId: "tenant-9",
      enrollmentId: "e-1",
    });
    expect(moveArgs).toEqual([
      {
        p_actor: "hq-1",
        p_student: "student-1",
        p_tenant: "tenant-9",
        p_grade: "고2",
        p_group_name: null,
        p_class_name: "3반",
        p_number: 7,
      },
    ]);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });

  test("반과 번호와 그룹은 비워도 된다(결정 102.14)", async () => {
    const r = await post({
      profileId: "student-1",
      tenantId: "tenant-9",
      grade: "고1",
    });

    expect(r.status).toBe(200);
    expect(moveArgs[0]).toMatchObject({
      p_group_name: null,
      p_class_name: null,
      p_number: null,
    });
  });

  test("성공하면 새 기관 기준 update, members 감사 로그에 이전과 이후 기관을 남긴다", async () => {
    await post(VALID);

    expect(kit.state.inserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        profile_id: "hq-1",
        actor_email: "hq@example.com",
        actor_kind: "hq",
        tenant_id: "tenant-9",
        action: "update",
        resource_key: "members",
        target_id: "student-1",
        meta: {
          fromTenantId: "tenant-1",
          toTenantId: "tenant-9",
          enrollmentId: "e-1",
        },
      },
    });
    expect(
      kit.state.events.indexOf("rpc:fn_admin_move_student_tenant"),
    ).toBeLessThan(kit.state.events.indexOf("insert:admin_access_logs"));
  });

  test.each([
    ["profileId 없음", { ...VALID, profileId: undefined }],
    ["tenantId 없음", { ...VALID, tenantId: "" }],
    ["잘못된 학년", { ...VALID, grade: "초6" }],
    ["학년 없음", { ...VALID, grade: undefined }],
    ["번호 0", { ...VALID, number: 0 }],
    ["번호 100", { ...VALID, number: 100 }],
    ["문자열 번호", { ...VALID, number: "7" }],
    ["문자열이 아닌 반", { ...VALID, className: 3 }],
    ["본문 없음", undefined],
  ])("%s 이면 400 이고 아무것도 옮기지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(moveArgs).toHaveLength(0);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test.each([
    ["WC096", 409, "PHONE_TAKEN"],
    ["WC080", 400, "GROUP_NOT_REGISTERED"],
    ["WC094", 403, "NOT_STUDENT"],
    ["WC099", 400, "SAME_TENANT"],
    ["WC100", 409, "OTHER_TENANT_ENROLLMENT"],
    ["P0002", 404, "TENANT_NOT_FOUND"],
  ])(
    "DB 함수가 %s 를 내면 %i %s 이고 감사 로그를 남기지 않는다",
    async (code, status, appCode) => {
      kit.state.rpc.fn_admin_move_student_tenant = () => ({
        data: null,
        error: { code },
      });

      const r = await post(VALID);

      expect(r.status).toBe(status);
      expect(r.body).toMatchObject({ error: { code: appCode } });
      expect(kit.state.inserts).toHaveLength(0);
    },
  );

  test("WC077 이면 409 이고 점유 학생 이름은 가려서 돌려준다", async () => {
    kit.state.rpc.fn_admin_move_student_tenant = () => ({
      data: null,
      error: { code: "WC077", details: "김하늘" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      error: { code: "NUMBER_TAKEN" },
      occupant: {
        grade: "고2",
        className: "3반",
        number: 7,
        displayName: "김*늘",
      },
    });
    expect(JSON.stringify(r.body)).not.toContain("김하늘");
  });

  test("알 수 없는 DB 에러는 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rpc.fn_admin_move_student_tenant = () => ({
      data: null,
      error: { code: "XX000" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(500);
  });

  test("POST 이외의 메서드는 405 이다", async () => {
    const r = await post(VALID, "GET");

    expect(r.status).toBe(405);
    expect(moveArgs).toHaveLength(0);
  });
});
