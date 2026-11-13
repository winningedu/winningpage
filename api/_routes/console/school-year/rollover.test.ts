// POST /api/console/school-year/rollover 계약 검증. 학교 관리자(대행 포함)만, 기관은 행위자에서 정한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  result: {
    data: [
      {
        graduated_count: 5,
        promoted_count: 20,
        skipped_count: 1,
        assigned_count: 18,
        pending_stored: 2,
        pending_skipped: 1,
        pending_deleted: 3,
      },
    ],
    error: null,
  } as { data: unknown; error: unknown },
  logError: null as unknown,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  inserts: [] as { table: string; row: Row }[],
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
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
      return Promise.resolve(state.result);
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: {
              login_id: "SM123456",
              school_year: 2026,
              org_type: "학원",
              is_catch_all: false,
            },
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

import handler from "./rollover.js";

async function post(body: unknown) {
  const captured = { status: 0, body: undefined as unknown };
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
      method: "POST",
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const SCHOOL_ADMIN = {
  kind: "school_admin",
  tenant_id: "tenant-1",
  teacher_id: "teacher-9",
  class_ids: [],
  proxy_session_id: null,
  must_change_password: false,
};

function rolloverCall() {
  return state.rpcCalls.find((c) => c.name === "fn_roster_rollover");
}

function midyearCall() {
  return state.rpcCalls.find((c) => c.name === "fn_roster_midyear");
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  // 2027-03-05 KST 는 2027학년도다. 기관(2026)은 달력보다 뒤라 넘기기 방식이다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-03-05T00:00:00+09:00"));
  state.actor = SCHOOL_ADMIN;
  state.result = {
    data: [
      {
        graduated_count: 5,
        promoted_count: 20,
        skipped_count: 1,
        assigned_count: 18,
        pending_stored: 2,
        pending_skipped: 1,
        pending_deleted: 3,
      },
    ],
    error: null,
  };
  state.logError = null;
  state.rpcCalls = [];
  state.inserts = [];
});

describe("POST /api/console/school-year/rollover", () => {
  test("rolls over the actor's tenant with snake_case rows and logs the counts", async () => {
    const result = await post({
      toYear: 2027,
      rows: [
        { studentId: "s-1", groupId: "g-1", className: "3", number: 4 },
        { studentId: "s-2", className: "5" },
      ],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        graduated: 5,
        promoted: 20,
        skipped: 1,
        assigned: 18,
        mode: "rollover",
        pendingStored: 2,
        pendingSkipped: 1,
        pendingDeleted: 3,
      },
    });
    expect(rolloverCall()?.args).toEqual({
      p_tenant: "tenant-1",
      p_to_year: 2027,
      p_rows: [
        { student_id: "s-1", group_id: "g-1", class_name: "3", number: 4 },
        { student_id: "s-2", group_id: null, class_name: "5", number: null },
      ],
      p_pending: [],
      p_actor: "user-1",
    });
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "schoolYear",
      tenant_id: "tenant-1",
      meta: {
        toYear: 2027,
        graduated: 5,
        promoted: 20,
        skipped: 1,
        assigned: 18,
      },
    });
  });

  test("not-signed-up lines ride along in snake_case, names stay out of the audit log", async () => {
    await post({
      toYear: 2027,
      pendingRows: [
        {
          name: "홍길동",
          grade: "고2",
          groupId: null,
          className: "3",
          number: 1,
        },
        {
          name: "김영희",
          grade: null,
          groupId: "g-1",
          className: null,
          number: null,
        },
      ],
    });

    expect(rolloverCall()?.args.p_pending).toEqual([
      {
        name: "홍길동",
        grade: "고2",
        group_id: null,
        class_name: "3",
        number: 1,
      },
      {
        name: "김영희",
        grade: null,
        group_id: "g-1",
        class_name: null,
        number: null,
      },
    ]);
    expect(JSON.stringify(state.inserts)).not.toContain("홍길동");
  });

  describe("mid-year (the tenant is already at the calendar school year)", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-11-13T12:00:00+09:00"));
      state.result = {
        data: [
          {
            updated_count: 4,
            skipped_count: 1,
            pending_stored: 2,
            pending_skipped: 0,
            pending_deleted: 6,
          },
        ],
        error: null,
      };
    });

    test("runs the mid-year function with the tenant's own year, row versions and the pending lines, and reports its counts", async () => {
      const result = await post({
        toYear: 2026,
        rows: [{ studentId: "s-1", className: "3", number: 4, version: 2 }],
        pendingRows: [
          {
            name: "홍길동",
            grade: "고2",
            groupId: null,
            className: "3",
            number: 1,
          },
        ],
      });

      expect(result).toEqual({
        status: 200,
        body: {
          ok: true,
          mode: "midyear",
          updated: 4,
          skipped: 1,
          pendingStored: 2,
          pendingSkipped: 0,
          pendingDeleted: 6,
        },
      });
      expect(midyearCall()?.args).toEqual({
        p_tenant: "tenant-1",
        p_rows: [
          {
            student_id: "s-1",
            group_id: null,
            class_name: "3",
            number: 4,
            version: 2,
          },
        ],
        p_pending: [
          {
            name: "홍길동",
            grade: "고2",
            group_id: null,
            class_name: "3",
            number: 1,
          },
        ],
        p_actor: "user-1",
      });
      expect(rolloverCall()).toBeUndefined();
      expect(
        state.inserts.find((i) => i.table === "admin_access_logs")?.row,
      ).toMatchObject({
        meta: {
          mode: "midyear",
          toYear: 2026,
          updated: 4,
          pendingStored: 2,
          pendingSkipped: 0,
          pendingDeleted: 6,
        },
      });
    });

    test("can run again and again: a second call is the same 200", async () => {
      expect((await post({ toYear: 2026 })).status).toBe(200);
      expect((await post({ toYear: 2026 })).status).toBe(200);
    });

    test("a school year that changed while waiting (40001) is a 409 with its own code", async () => {
      state.result = { data: null, error: { code: "40001" } };
      expect(
        await post({
          toYear: 2026,
          rows: [{ studentId: "s-1", className: "3", version: 2 }],
        }),
      ).toMatchObject({
        status: 409,
        body: { error: { code: "SCHOOL_YEAR_CHANGED" } },
      });
    });

    test("a version mismatch is 409 and a row without a version is a 400", async () => {
      state.result = { data: null, error: { code: "WC078" } };
      expect(
        await post({
          toYear: 2026,
          rows: [{ studentId: "s-1", className: "3", version: 2 }],
        }),
      ).toMatchObject({
        status: 409,
        body: { error: { code: "VERSION_CONFLICT" } },
      });
      expect(
        (
          await post({
            toYear: 2026,
            rows: [{ studentId: "s-1", className: "3" }],
          })
        ).status,
      ).toBe(400);
    });
  });

  test("a toYear that does not fit the tenant's mode is a 400 and nothing runs", async () => {
    expect((await post({ toYear: 2026 })).status).toBe(400);
    vi.setSystemTime(new Date("2026-11-13T12:00:00+09:00"));
    expect((await post({ toYear: 2027 })).status).toBe(400);
    expect(rolloverCall()).toBeUndefined();
    expect(midyearCall()).toBeUndefined();
  });

  test("limits: more rows than the preview allows, a class name over 30 characters, an unknown grade and a name of only control characters are 400", async () => {
    const row = { studentId: "s", className: "3" };
    const pendingLine = {
      name: "홍길동",
      grade: "고2",
      groupId: null,
      className: "3",
      number: 1,
    };
    const bodies = [
      { toYear: 2027, rows: Array.from({ length: 3001 }, () => row) },
      {
        toYear: 2027,
        pendingRows: Array.from({ length: 3001 }, () => pendingLine),
      },
      { toYear: 2027, rows: [{ ...row, className: "가".repeat(31) }] },
      {
        toYear: 2027,
        pendingRows: [{ ...pendingLine, className: "가".repeat(31) }],
      },
      { toYear: 2027, pendingRows: [{ ...pendingLine, grade: "중4" }] },
      { toYear: 2027, pendingRows: [{ ...pendingLine, name: "\u200b\u0007" }] },
      {
        toYear: 2027,
        pendingRows: [{ ...pendingLine, name: "가".repeat(51) }],
      },
    ];
    for (const body of bodies) {
      expect((await post(body)).status).toBe(400);
    }
    expect(rolloverCall()).toBeUndefined();
  });

  test("control and format characters are stripped from a pending name before it is stored", async () => {
    await post({
      toYear: 2027,
      pendingRows: [
        {
          name: " 홍\u200b길\u0007동 ",
          grade: "고2",
          groupId: null,
          className: "3",
          number: 1,
        },
      ],
    });
    const sent = (rolloverCall()?.args.p_pending ?? []) as { name: string }[];
    expect(sent[0]?.name).toBe("홍길동");
  });

  test("a pending line with a bad number or no name is a 400", async () => {
    for (const bad of [
      { name: "", grade: "고2", groupId: null, className: "3", number: 1 },
      {
        name: "홍길동",
        grade: "고2",
        groupId: null,
        className: "3",
        number: 0,
      },
    ]) {
      expect((await post({ toYear: 2027, pendingRows: [bad] })).status).toBe(
        400,
      );
    }
  });

  test("a homeroom teacher is refused by the handler (403) and nothing runs", async () => {
    state.actor = { ...SCHOOL_ADMIN, kind: "homeroom", class_ids: ["c-1"] };
    expect(await post({ toYear: 2027 })).toMatchObject({
      status: 403,
      body: { error: { code: "NOT_SCHOOL_ADMIN" } },
    });
    expect(rolloverCall()).toBeUndefined();
  });

  test("a second run that changed nothing still answers 200 with zero counts and is logged", async () => {
    state.result = {
      data: [
        {
          graduated_count: 0,
          promoted_count: 0,
          skipped_count: 0,
          assigned_count: 0,
          pending_stored: 0,
          pending_skipped: 0,
        },
      ],
      error: null,
    };
    const result = await post({ toYear: 2027 });
    expect(result).toMatchObject({ status: 200, body: { promoted: 0 } });
    expect(rolloverCall()?.args.p_rows).toEqual([]);
  });

  test("number taken is 409 and nothing is logged", async () => {
    state.result = { data: null, error: { code: "WC077" } };
    expect(await post({ toYear: 2027 })).toMatchObject({
      status: 409,
      body: { error: { code: "NUMBER_TAKEN" } },
    });
    expect(state.inserts).toEqual([]);
  });

  test.each([
    ["no year", {}],
    ["year not an integer", { toYear: "2027" }],
    ["rows not an array", { toYear: 2027, rows: "x" }],
    ["row without student", { toYear: 2027, rows: [{ className: "3" }] }],
    [
      "row number out of range",
      { toYear: 2027, rows: [{ studentId: "s", className: "3", number: 0 }] },
    ],
  ])("%s is a 400", async (_name, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(rolloverCall()).toBeUndefined();
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await post({ toYear: 2027 })).status).toBe(500);
  });
});
