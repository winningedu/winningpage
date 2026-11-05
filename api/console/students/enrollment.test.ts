// PATCH /api/console/students/enrollment 계약 검증.
// 관리자 클라이언트는 createSupabaseAdmin 모킹으로 바꿔 끼우고, 조회는 eq/in 필터를 실제로 적용하는 메모리 표로 흉내 낸다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  tables: {} as Record<string, Row[]>,
  updateResult: {
    data: [{ enrollment_id: "enr-1", version: 4 }],
    error: null,
  } as {
    data: unknown;
    error: unknown;
  },
  logError: null as unknown,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  inserts: [] as { table: string; row: Row }[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "t@example.com" } },
        error: null,
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "fn_console_actor") {
        return Promise.resolve({ data: [state.actor], error: null });
      }
      if (name === "fn_enrollment_update") {
        return Promise.resolve(state.updateResult);
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          // PostgREST 는 숫자 열도 문자열 값으로 비교한다.
          filters.push((r) => String(r[col]) === String(val));
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              (state.tables[table] ?? []).find((r) =>
                filters.every((f) => f(r)),
              ) ?? null,
            error: null,
          }),
        insert: (row: Row) => {
          state.inserts.push({ table, row });
          return Promise.resolve({ error: state.logError });
        },
      };
      return chain;
    },
  }),
}));

import handler from "./enrollment.js";

type Captured = { status: number; body: unknown };

async function patch(body: unknown): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "PATCH",
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const HOMEROOM = {
  kind: "homeroom",
  tenant_id: "tenant-1",
  teacher_id: "teacher-1",
  class_ids: ["class-A"],
  proxy_session_id: null,
  must_change_password: false,
};
const SCHOOL_ADMIN = {
  ...HOMEROOM,
  kind: "school_admin",
  teacher_id: "teacher-9",
  class_ids: [],
};

const BODY = {
  studentId: "student-1",
  expectedVersion: 3,
  grade: "고2",
  classId: "class-B",
  number: 7,
  reason: "class_change",
};

function updateCall() {
  return state.rpcCalls.find((c) => c.name === "fn_enrollment_update");
}

beforeEach(() => {
  state.actor = HOMEROOM;
  state.tables = {
    tenants: [{ id: "tenant-1", school_year: 2026 }],
    teachers: [{ id: "teacher-1", login_id: "SM123456" }],
    student_enrollments: [
      {
        student_id: "student-1",
        tenant_id: "tenant-1",
        school_year: 2026,
        class_id: "class-A",
        version: 3,
      },
      {
        student_id: "student-2",
        tenant_id: "tenant-1",
        school_year: 2026,
        class_id: "class-Z",
        version: 1,
      },
      {
        student_id: "student-3",
        tenant_id: "tenant-1",
        school_year: 2026,
        class_id: null,
        version: 1,
      },
      {
        student_id: "student-4",
        tenant_id: "tenant-2",
        school_year: 2026,
        class_id: "class-Q",
        version: 1,
      },
    ],
  };
  state.updateResult = {
    data: [{ enrollment_id: "enr-1", version: 4 }],
    error: null,
  };
  state.logError = null;
  state.rpcCalls = [];
  state.inserts = [];
});

describe("PATCH /api/console/students/enrollment", () => {
  test("homeroom edits an own-class student as homeroom_edit and the change is logged", async () => {
    const result = await patch(BODY);

    expect(result).toEqual({
      status: 200,
      body: { ok: true, enrollmentId: "enr-1", version: 4 },
    });
    expect(updateCall()?.args).toEqual({
      p_student: "student-1",
      p_expected_version: 3,
      p_to_grade: "고2",
      p_to_class_id: "class-B",
      p_to_number: 7,
      p_kind: "homeroom_edit",
      p_reason: "class_change",
      p_apply_year: null,
      p_actor: "user-1",
      p_tenant: "tenant-1",
      p_allowed_class_ids: ["class-A"],
    });
    const log = state.inserts.find((i) => i.table === "admin_access_logs")?.row;
    expect(log).toMatchObject({
      action: "update",
      resource_key: "studentEnrollment",
      target_id: "student-1",
      tenant_id: "tenant-1",
      actor_kind: "teacher",
      teacher_id: "teacher-1",
    });
  });

  test("homeroom cannot edit a student outside own classes, other tenant, or the pool (404, no RPC, no log)", async () => {
    for (const studentId of ["student-2", "student-3", "student-4", "ghost"]) {
      state.rpcCalls = [];
      const result = await patch({ ...BODY, studentId });
      expect(result).toEqual({
        status: 404,
        body: {
          error: { code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." },
        },
      });
      expect(updateCall()).toBeUndefined();
    }
    expect(state.inserts).toEqual([]);
  });

  test("school admin edits any student in the tenant, pool students as pool_assign, never other tenants", async () => {
    state.actor = SCHOOL_ADMIN;

    expect((await patch({ ...BODY, studentId: "student-2" })).status).toBe(200);
    expect(updateCall()?.args.p_kind).toBe("admin_direct");
    expect(updateCall()?.args).toMatchObject({
      p_tenant: "tenant-1",
      p_allowed_class_ids: null,
    });

    state.rpcCalls = [];
    expect(
      (await patch({ ...BODY, studentId: "student-3", expectedVersion: 1 }))
        .status,
    ).toBe(200);
    expect(updateCall()?.args.p_kind).toBe("pool_assign");

    expect((await patch({ ...BODY, studentId: "student-4" })).status).toBe(404);
  });

  test("applyYear selects that year's enrollment and is passed through", async () => {
    state.actor = SCHOOL_ADMIN;
    state.tables.student_enrollments?.push({
      student_id: "student-2",
      tenant_id: "tenant-1",
      school_year: 2027,
      class_id: null,
      version: 5,
    });

    const result = await patch({
      ...BODY,
      studentId: "student-2",
      applyYear: 2027,
      expectedVersion: 5,
    });

    expect(result.status).toBe(200);
    expect(updateCall()?.args).toMatchObject({
      p_apply_year: 2027,
      p_kind: "pool_assign",
    });
  });

  test("version conflict and number taken are 409 and nothing is logged", async () => {
    state.updateResult = { data: null, error: { code: "WC078" } };
    expect(await patch(BODY)).toMatchObject({
      status: 409,
      body: { error: { code: "VERSION_CONFLICT" } },
    });

    state.updateResult = { data: null, error: { code: "WC077" } };
    expect(await patch(BODY)).toMatchObject({
      status: 409,
      body: { error: { code: "NUMBER_TAKEN" } },
    });
    expect(state.inserts).toEqual([]);
  });

  test("invalid class reference is 400 and an unknown RPC failure is 500", async () => {
    state.updateResult = { data: null, error: { code: "23503" } };
    expect((await patch(BODY)).status).toBe(400);

    state.updateResult = { data: null, error: { code: "XX000" } };
    expect((await patch(BODY)).status).toBe(500);
  });

  test.each([
    ["missing student", { ...BODY, studentId: "" }],
    ["version not an integer", { ...BODY, expectedVersion: "3" }],
    ["unknown grade", { ...BODY, grade: "고4" }],
    ["number out of range", { ...BODY, number: 100 }],
    ["unknown reason", { ...BODY, reason: "because" }],
    ["apply year not an integer", { ...BODY, applyYear: "2027" }],
  ])("%s is a 400 before any lookup", async (_name, body) => {
    const result = await patch(body);
    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(updateCall()).toBeUndefined();
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await patch(BODY)).status).toBe(500);
  });
});
