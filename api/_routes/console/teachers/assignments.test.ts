// POST /api/console/teachers/assignments 계약 검증(W16a). 담당 학급을 더하고, 지우고, 주담당을 정한다.

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

import handler from "./assignments.js";

const post = (body: unknown) => callHandler(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => [
    {
      id: "teacher-1",
      tenant_id: "tenant-1",
      profile_id: null,
      deleted_at: null,
    },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/assignments mixed-grade class", () => {
  test("an academy tenant adds a mixed-grade class with a null grade", async () => {
    kit.state.rows.tenants = () => ({ org_type: "사기업" });
    let args: Record<string, unknown> = {};
    kit.state.rpc.fn_assignment_set = (a) => {
      args = a;
      return { data: null, error: null };
    };

    const r = await post({
      teacherId: "teacher-1",
      add: [{ grade: null, name: "A" }],
    });

    expect(r.status).toBe(200);
    expect(args.p_add).toEqual([{ grade: null, name: "A" }]);
  });

  test("a school tenant cannot add a mixed-grade class: 400 and nothing is written", async () => {
    kit.state.rows.tenants = () => ({ org_type: "학교" });
    const rpc = vi.fn(() => ({ data: null, error: null }));
    kit.state.rpc.fn_assignment_set = rpc;

    const r = await post({
      teacherId: "teacher-1",
      add: [{ grade: null, name: "A" }],
    });

    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(kit.state.inserts).toHaveLength(0);
  });
});

describe("POST /api/console/teachers/assignments", () => {
  test("더할 학급, 지울 학급, 주담당을 fn_assignment_set 에 넘기고 감사 로그를 남긴다", async () => {
    let args: Record<string, unknown> = {};
    kit.state.rpc.fn_assignment_set = (a) => {
      args = a;
      return { data: null, error: null };
    };

    const r = await post({
      teacherId: "teacher-1",
      add: [{ grade: "고1", name: "3반", groupId: "group-1" }],
      removeClassIds: ["class-9"],
      primaryClassId: "class-2",
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(args).toEqual({
      p_teacher_id: "teacher-1",
      p_add: [{ grade: "고1", name: "3반", group_id: "group-1" }],
      p_remove_class_ids: ["class-9"],
      p_primary: "class-2",
      p_tenant: "tenant-1",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "update",
      resource_key: "console.teacher_assignments",
      target_id: "teacher-1",
      meta: { added: 1, removed: 1, primaryClassId: "class-2" },
    });
  });

  test.each([
    ["담임의 마지막 학급 제거", "WC092", 409, "LAST_CLASS_REQUIRED"],
    ["다른 교사가 이미 담임인 학급", "23505", 409, "CLASS_TAKEN"],
    ["배정되지 않은 주담당", "WC093", 400, "PRIMARY_NOT_ASSIGNED"],
  ])(
    "%s 는 %s 로 막혀 %i %s 응답이고 감사 로그를 남기지 않는다",
    async (_label, dbCode, status, code) => {
      kit.state.rpc.fn_assignment_set = () => ({
        data: null,
        error: { code: dbCode },
      });

      const r = await post({
        teacherId: "teacher-1",
        removeClassIds: ["class-1"],
      });

      expect(r.status).toBe(status);
      expect(r.body).toMatchObject({ error: { code } });
      expect(kit.state.inserts).toHaveLength(0);
    },
  );

  test("다른 기관 교사는 404", async () => {
    kit.state.rows.teachers = () => [
      {
        id: "teacher-1",
        tenant_id: "tenant-2",
        profile_id: null,
        deleted_at: null,
      },
    ];

    const r = await post({ teacherId: "teacher-1", add: [] });

    expect(r.status).toBe(404);
    expect(kit.state.events).not.toContain("rpc:fn_assignment_set");
  });

  test.each([
    ["교사 누락", { add: [] }],
    ["add 가 배열이 아님", { teacherId: "teacher-1", add: "3반" }],
    [
      "removeClassIds 가 문자열 배열이 아님",
      { teacherId: "teacher-1", removeClassIds: [1] },
    ],
    [
      "primaryClassId 가 문자열이 아님",
      { teacherId: "teacher-1", primaryClassId: 5 },
    ],
  ])("%s 이면 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await post({ teacherId: "teacher-1" })).status).toBe(403);
  });
});
