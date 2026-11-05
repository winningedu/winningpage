// POST /api/console/teachers/import 계약 검증(W15). 판정 9종은 서버가 다시 계산한다.
// 가짜 service_role 클라이언트는 consoleTestKit.

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

import handler from "./import.js";

const post = (body: unknown) => callHandler(handler, body);

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

interface Row {
  name: string;
  phone: string;
  grade?: string;
  group?: string;
  className?: string;
}

const row = (over: Partial<Row> = {}): Row => ({
  name: "김교사",
  phone: "010-1111-2222",
  grade: "고1",
  className: "3반",
  ...over,
});

const run = (rows: Row[], over: Record<string, unknown> = {}) =>
  post({ requestId: REQUEST_ID, mode: "skip", rows, ...over });

interface Body {
  ok: boolean;
  replayed?: boolean;
  counts: {
    total: number;
    created: number;
    updated: number;
    accounts: number;
    errors: number;
    skipped: number;
  };
  rows: { index: number; verdict: string; applied: boolean }[];
  accounts: { loginId: string; tempPassword: string; rowIndexes: number[] }[];
}

const registerCalls: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  registerCalls.length = 0;
  kit.state.rpc.fn_teacher_register = (args) => {
    registerCalls.push(args);
    return {
      data: [{ teacher_id: `t-${args.p_phone}`, verdict: "created" }],
      error: null,
    };
  };
  kit.state.rows.tenants = () => ({ org_type: "학교", school_year: 2026 });
  kit.state.rows.teachers = (filters) =>
    typeof filters.id === "string"
      ? {
          login_id: `LOGIN${filters.id.slice(-9)}`,
          profile_id: null,
          temp_password_issued_at: "2026-11-05T05:00:00Z",
        }
      : [];
  kit.state.rows.class_groups = () => [];
  kit.state.rows.classes = () => [];
  kit.state.rows.teacher_class_assignments = () => [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/import", () => {
  test("신규 교사는 신규로 판정하고 등록한 뒤 임시 비밀번호를 응답에 한 번만 싣는다", async () => {
    const r = await run([row()]);

    expect(r.status).toBe(200);
    const body = r.body as Body;
    expect(body.rows).toEqual([{ index: 0, verdict: "new", applied: true }]);
    expect(body.counts).toMatchObject({
      total: 1,
      created: 1,
      updated: 0,
      accounts: 1,
      errors: 0,
    });
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]?.tempPassword).toHaveLength(10);
    expect(body.accounts[0]?.rowIndexes).toEqual([0]);
    expect(registerCalls[0]).toMatchObject({
      p_tenant_id: "tenant-1",
      p_name: "김교사",
      p_phone: "01011112222",
      p_role: "homeroom",
      p_classes: [{ grade: "고1", name: "3반" }],
    });
  });
});
