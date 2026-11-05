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

/** 기관에 이미 있는 교사. 전화번호 조회에는 이 목록을, 등록 뒤 한 건 조회에는 계정 없는 행을 돌려준다. */
function existingTeachers(list: Record<string, unknown>[]) {
  kit.state.rows.teachers = (filters) =>
    typeof filters.id === "string"
      ? {
          login_id: `LOGIN${filters.id.slice(-9)}`,
          profile_id: null,
          temp_password_issued_at: "2026-11-05T05:00:00Z",
        }
      : list;
}

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

  describe("행 판정 오류 (그 행만 제외하고 나머지는 등록한다)", () => {
    test.each([
      ["이름이 비어 있음", row({ name: " " })],
      ["전화번호가 비어 있음", row({ phone: "" })],
      ["전화번호 형식이 틀림", row({ phone: "02-123-4567" })],
      ["학년이 목록에 없음", row({ grade: "7학년" })],
      ["학년만 있고 반이 없음", row({ className: "" })],
      ["반 이름이 숫자가 아님(학교)", row({ className: "가나다" })],
    ])("%s 이면 형식 오류이고 등록하지 않는다", async (_label, bad) => {
      const r = await run([bad, row({ name: "박교사", phone: "01022223333" })]);

      const body = r.body as Body;
      expect(r.status).toBe(200);
      expect(body.rows[0]).toEqual({
        index: 0,
        verdict: "format_error",
        applied: false,
      });
      expect(body.rows[1]).toMatchObject({ verdict: "new", applied: true });
      expect(registerCalls).toHaveLength(1);
      expect(body.counts).toMatchObject({ errors: 1, created: 1 });
    });

    test("학년과 반이 모두 없는 행(담임이 아닌 교사)은 유효하다", async () => {
      const r = await run([row({ grade: "", className: "" })]);

      expect((r.body as Body).rows[0]).toMatchObject({ verdict: "new" });
      expect(registerCalls[0]).toMatchObject({ p_classes: [] });
    });

    test("등록되지 않은 그룹이면 오류이고, 등록된 그룹은 이름 대소문자와 무관하게 찾는다", async () => {
      kit.state.rows.tenants = () => ({
        org_type: "사기업",
        school_year: 2026,
      });
      kit.state.rows.class_groups = () => [{ id: "group-1", name: "Alpha" }];

      const r = await run([
        row({ group: "Beta", name: "가", phone: "01000000001" }),
        row({ group: "alpha", name: "나", phone: "01000000002" }),
      ]);

      const body = r.body as Body;
      expect(body.rows[0]).toMatchObject({
        verdict: "group_not_registered",
        applied: false,
      });
      expect(body.rows[1]).toMatchObject({ verdict: "new", applied: true });
      expect(registerCalls[0]).toMatchObject({
        p_classes: [{ grade: "고1", name: "3반", group_id: "group-1" }],
      });
    });

    test("학교는 그룹을 쓰지 않으므로 그룹이 있으면 등록되지 않은 그룹 오류이다", async () => {
      const r = await run([row({ group: "Alpha" })]);

      expect((r.body as Body).rows[0]?.verdict).toBe("group_not_registered");
    });

    test("파일 안에서 같은 학급이 두 번 나오면 두 번째 행만 학급 중복이고, 표기가 달라도(03, 3반) 같은 학급이다", async () => {
      const r = await run([
        row({ name: "가", phone: "01000000001", className: "3" }),
        row({ name: "나", phone: "01000000002", className: "03반" }),
        row({ name: "다", phone: "01000000003", className: "4" }),
      ]);

      const body = r.body as Body;
      expect(body.rows.map((x) => x.verdict)).toEqual([
        "new",
        "class_duplicate",
        "new",
      ]);
      expect(body.rows[1]?.applied).toBe(false);
      expect(registerCalls.map((c) => c.p_name)).toEqual(["가", "다"]);
    });

    test("같은 전화번호가 이름이 다른 기존 교사에게 쓰이면 전화번호 오류이다", async () => {
      existingTeachers([
        {
          id: "other-1",
          name: "이교사",
          phone: "01011112222",
          deleted_at: null,
        },
      ]);

      const r = await run([row()]);

      expect((r.body as Body).rows[0]).toEqual({
        index: 0,
        verdict: "phone_conflict",
        applied: false,
      });
      expect(registerCalls).toHaveLength(0);
    });

    test("파일 안에서 같은 전화번호에 이름이 다르면 뒤의 행이 전화번호 오류이다", async () => {
      const r = await run([
        row({ name: "가", className: "1" }),
        row({ name: "나", className: "2" }),
      ]);

      expect((r.body as Body).rows.map((x) => x.verdict)).toEqual([
        "new",
        "phone_conflict",
      ]);
    });

    test("삭제된 교사의 전화번호는 충돌로 보지 않는다", async () => {
      existingTeachers([
        {
          id: "gone-1",
          name: "이교사",
          phone: "01011112222",
          deleted_at: "2026-10-01T00:00:00Z",
        },
      ]);

      const r = await run([row()]);

      expect((r.body as Body).rows[0]?.verdict).toBe("new");
    });
  });

  describe("행 판정 (같은 사람, 다른 사람, 담임 변경)", () => {
    const CLASS_3 = { id: "class-3", grade: "고1", group_id: null, name: "3" };

    function classHeldBy(teacher: { id: string; name: string; phone: string }) {
      kit.state.rows.classes = () => [CLASS_3];
      kit.state.rows.teacher_class_assignments = () => [
        { teacher_id: teacher.id, class_id: "class-3" },
      ];
      existingTeachers([{ ...teacher, deleted_at: null }]);
    }

    const MOVED: { class: string; teacher: string }[] = [];

    beforeEach(() => {
      MOVED.length = 0;
      kit.state.rpc.fn_teacher_import_move_class = (args) => {
        MOVED.push({
          class: args.p_class_id as string,
          teacher: args.p_teacher_id as string,
        });
        return { data: null, error: null };
      };
    });

    test("이름이 같고 전화번호가 다른 기존 교사가 있으면 이름이 같은 다른 선생님이고 따로 등록한다", async () => {
      existingTeachers([
        {
          id: "other-1",
          name: "김교사",
          phone: "01099998888",
          deleted_at: null,
        },
      ]);

      const r = await run([row()]);

      expect((r.body as Body).rows[0]).toEqual({
        index: 0,
        verdict: "same_name_other",
        applied: true,
      });
      expect(registerCalls).toHaveLength(1);
    });

    test("파일 안에서 이름이 같고 전화번호가 다른 두 행은 모두 이름이 같은 다른 선생님이다", async () => {
      const r = await run([
        row({ phone: "01000000001", className: "1" }),
        row({ phone: "01000000002", className: "2" }),
      ]);

      const body = r.body as Body;
      expect(body.rows.map((x) => x.verdict)).toEqual([
        "same_name_other",
        "same_name_other",
      ]);
      expect(body.counts.created).toBe(2);
      expect(body.accounts).toHaveLength(2);
    });

    test("이름과 전화번호가 같은 여러 행은 여러 반 공통 아이디이고 계정 하나에 학급을 모두 더한다", async () => {
      const r = await run([
        row({ className: "1" }),
        row({ className: "2" }),
        row({ name: "박교사", phone: "01055556666", className: "3" }),
      ]);

      const body = r.body as Body;
      expect(body.rows.map((x) => x.verdict)).toEqual([
        "shared_login",
        "shared_login",
        "new",
      ]);
      expect(registerCalls).toHaveLength(2);
      expect(registerCalls[0]?.p_classes).toEqual([
        { grade: "고1", name: "1" },
        { grade: "고1", name: "2" },
      ]);
      expect(body.counts).toMatchObject({ created: 2, accounts: 2 });
      expect(body.accounts[0]?.rowIndexes).toEqual([0, 1]);
    });

    test("이미 같은 사람이 담임인 학급은 동일이고 아무것도 바꾸지 않는다", async () => {
      classHeldBy({ id: "t-me", name: "김교사", phone: "01011112222" });

      const r = await run([row()], { mode: "overwrite" });

      const body = r.body as Body;
      expect(body.rows[0]).toEqual({
        index: 0,
        verdict: "same",
        applied: false,
      });
      expect(registerCalls).toHaveLength(0);
      expect(MOVED).toHaveLength(0);
      expect(body.counts).toMatchObject({ created: 0, updated: 0, errors: 0 });
    });

    test("학년과 반이 없는 행의 교사가 이미 등록돼 있으면 동일이다", async () => {
      existingTeachers([
        { id: "t-me", name: "김교사", phone: "01011112222", deleted_at: null },
      ]);

      const r = await run([row({ grade: "", className: "" })]);

      expect((r.body as Body).rows[0]?.verdict).toBe("same");
      expect(registerCalls).toHaveLength(0);
    });

    test("이미 등록된 교사에게 비어 있는 학급을 더하는 행은 신규이고 새 계정은 만들지 않는다", async () => {
      existingTeachers([
        { id: "t-me", name: "김교사", phone: "01011112222", deleted_at: null },
      ]);
      kit.state.rpc.fn_teacher_register = () => ({
        data: [{ teacher_id: "t-me", verdict: "classes_added" }],
        error: null,
      });
      kit.state.rows.teachers = (filters) =>
        typeof filters.id === "string"
          ? { login_id: "ABCD2345XY7Z9K", profile_id: "profile-me" }
          : [{ id: "t-me", name: "김교사", phone: "01011112222" }];

      const r = await run([row()]);

      const body = r.body as Body;
      expect(body.rows[0]).toMatchObject({ verdict: "new", applied: true });
      expect(body.counts).toMatchObject({ created: 0, accounts: 0 });
      expect(body.accounts).toEqual([]);
    });

    test("다른 담임이 있는 학급은 변경이고, 건너뛰기에서는 아무것도 바꾸지 않는다", async () => {
      classHeldBy({ id: "t-old", name: "이전담임", phone: "01077778888" });

      const r = await run([row()], { mode: "skip" });

      const body = r.body as Body;
      expect(body.rows[0]).toEqual({
        index: 0,
        verdict: "changed",
        applied: false,
      });
      expect(body.counts).toMatchObject({
        created: 0,
        updated: 0,
        skipped: 1,
        errors: 0,
      });
      expect(registerCalls).toHaveLength(0);
      expect(MOVED).toHaveLength(0);
    });

    test("덮어쓰기에서는 교사를 등록한 뒤 학급을 새 교사에게 옮긴다", async () => {
      classHeldBy({ id: "t-old", name: "이전담임", phone: "01077778888" });

      const r = await run([row()], { mode: "overwrite" });

      const body = r.body as Body;
      expect(body.rows[0]).toEqual({
        index: 0,
        verdict: "changed",
        applied: true,
      });
      expect(registerCalls[0]).toMatchObject({ p_classes: [] });
      expect(MOVED).toEqual([{ class: "class-3", teacher: "t-01011112222" }]);
      expect(body.counts).toMatchObject({
        created: 1,
        updated: 1,
        skipped: 0,
        accounts: 1,
      });
      expect(kit.state.events.indexOf("rpc:fn_teacher_register")).toBeLessThan(
        kit.state.events.indexOf("rpc:fn_teacher_import_move_class"),
      );
    });

    test("옮기기가 거부되면 에러가 코드 붙은 응답으로 나간다", async () => {
      classHeldBy({ id: "t-old", name: "이전담임", phone: "01077778888" });
      kit.state.rpc.fn_teacher_import_move_class = () => ({
        data: null,
        error: { code: "WC088" },
      });

      const r = await run([row()], { mode: "overwrite" });

      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ error: { code: "NOT_FOUND" } });
    });
  });
});
