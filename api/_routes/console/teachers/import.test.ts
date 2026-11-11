// POST /api/console/teachers/import 계약 검증(W15). 판정 9종은 서버가 다시 계산한다.
// 가짜 service_role 클라이언트는 consoleTestKit.

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
  post({ requestId: REQUEST_ID, chunkIndex: 1, mode: "skip", rows, ...over });

interface Body {
  ok: boolean;
  replayed?: boolean;
  runId?: string;
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
const claimCalls: Record<string, unknown>[] = [];

/** 청크 멱등 키 판정(fn_teacher_import_chunk_claim)이 돌려줄 outcome 을 정한다. */
function claimOutcome(outcome: string) {
  kit.state.rpc.fn_teacher_import_chunk_claim = (args) => {
    claimCalls.push(args);
    return { data: [{ outcome, run_id: "run-1" }], error: null };
  };
}

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
  claimCalls.length = 0;
  claimOutcome("claimed");
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

  describe("실행 기록과 멱등성", () => {
    const FINISHED_RUN = {
      id: "run-1",
      tenant_id: "tenant-1",
      finished_at: "2026-11-05T05:30:00Z",
      total_rows: 2,
      created_count: 1,
      updated_count: 0,
      account_count: 1,
      error_count: 1,
      row_results: [
        { index: 0, verdict: "new", applied: true },
        { index: 1, verdict: "format_error", applied: false },
      ],
    };

    test("끝나면 건수와 행 판정(행 번호, 판정, 적용 여부만)을 실행 기록에 남기고 import 감사 로그를 남긴다", async () => {
      const r = await run([row(), row({ phone: "", name: "가" })]);

      expect(r.status).toBe(200);
      expect(claimCalls).toEqual([
        {
          p_tenant: "tenant-1",
          p_request_id: REQUEST_ID,
          p_chunk_index: 1,
          p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          p_actor: "profile-1",
          p_proxy_session: null,
          p_total_rows: 2,
        },
      ]);
      const insertedId = "run-1";
      expect(kit.state.updates).toHaveLength(1);
      expect(kit.state.updates[0]).toMatchObject({
        table: "teacher_import_runs",
        values: {
          created_count: 1,
          updated_count: 0,
          account_count: 1,
          error_count: 1,
          row_results: [
            { index: 0, verdict: "new", applied: true },
            { index: 1, verdict: "format_error", applied: false },
          ],
        },
        filters: { id: insertedId },
      });
      expect(kit.state.updates[0]?.values.finished_at).toEqual(
        expect.any(String),
      );
      const audit = kit.state.inserts.find(
        (i) => i.row.action === "teacher_import",
      );
      expect(audit?.row).toMatchObject({
        action: "teacher_import",
        tenant_id: "tenant-1",
        target_id: insertedId,
        row_count: 2,
        meta: { created: 1, updated: 0, accounts: 1, errors: 1, skipped: 0 },
      });
      expect(
        kit.state.events.filter(
          (e) => e === "insert:admin_access_logs" || e.startsWith("update:"),
        ),
      ).toEqual([
        "insert:admin_access_logs",
        "insert:admin_access_logs",
        "update:teacher_import_runs",
      ]);
    });

    test("임시 비밀번호는 실행 기록, 감사 로그, 콘솔 로그에 남지 않는다", async () => {
      const logs = [
        vi.spyOn(console, "log").mockImplementation(() => {}),
        vi.spyOn(console, "error").mockImplementation(() => {}),
        vi.spyOn(console, "warn").mockImplementation(() => {}),
      ];

      const r = await run([row()]);

      const password = (r.body as Body).accounts[0]?.tempPassword as string;
      expect(JSON.stringify(kit.state.inserts)).not.toContain(password);
      expect(JSON.stringify(kit.state.updates)).not.toContain(password);
      expect(JSON.stringify(kit.state.updates)).not.toContain("01011112222");
      for (const spy of logs) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
      }
    });

    test("같은 requestId 로 이미 끝난 실행이면 새로 만들지 않고 저장된 결과를 돌려준다(임시 비밀번호는 없다)", async () => {
      claimOutcome("replay");
      kit.state.rows.teacher_import_runs = () => FINISHED_RUN;

      const r = await run([row(), row({ phone: "" })]);

      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        ok: true,
        replayed: true,
        runId: "run-1",
        counts: {
          total: 2,
          created: 1,
          updated: 0,
          accounts: 1,
          errors: 1,
          skipped: 0,
        },
        rows: FINISHED_RUN.row_results,
        accounts: [],
      });
      expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
      expect(kit.state.auth.createUser).not.toHaveBeenCalled();
      expect(kit.state.updates).toHaveLength(0);
    });

    test("다른 기관의 requestId 와 겹치면 409 REQUEST_ID_IN_USE 이고 아무것도 만들지 않는다", async () => {
      claimOutcome("other_tenant");

      const r = await run([row()]);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code: "REQUEST_ID_IN_USE" } });
      expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
    });

    test("끝나지 않은 같은 실행은 이어서 처리해 마무리한다", async () => {
      claimOutcome("resumed");

      const r = await run([row()]);

      const body = r.body as Body;
      expect(body.replayed).toBe(false);
      expect(body.runId).toBe("run-1");
      expect(registerCalls).toHaveLength(1);
      expect(kit.state.updates[0]?.filters).toEqual({ id: "run-1" });
    });

    test("같은 키에 다른 내용이면 400 IDEMPOTENCY_KEY_MISMATCH 이고 아무것도 만들지 않는다", async () => {
      claimOutcome("mismatch");

      const r = await run([row()]);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        error: { code: "IDEMPOTENCY_KEY_MISMATCH" },
      });
      expect(registerCalls).toHaveLength(0);
      expect(kit.state.updates).toHaveLength(0);
    });

    test("다른 요청이 처리 중인 청크는 409 IN_PROGRESS 이고 등록하지 않는다", async () => {
      claimOutcome("in_progress");

      const r = await run([row()]);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code: "IN_PROGRESS" } });
      expect(registerCalls).toHaveLength(0);
      expect(kit.state.updates).toHaveLength(0);
    });

    test("청크 1, 2, 3 은 한 requestId 아래 각각 키(requestId, chunkIndex)로 처리한다", async () => {
      for (const chunkIndex of [1, 2, 3]) {
        const r = await run([row({ phone: `010-0000-000${chunkIndex}` })], {
          chunkIndex,
        });
        expect(r.status).toBe(200);
      }

      expect(claimCalls.map((c) => [c.p_request_id, c.p_chunk_index])).toEqual([
        [REQUEST_ID, 1],
        [REQUEST_ID, 2],
        [REQUEST_ID, 3],
      ]);
      expect(registerCalls).toHaveLength(3);
    });

    test("해시는 같은 내용이면 같고 행이나 적용 방식이 다르면 달라진다", async () => {
      await run([row()]);
      await run([row()]);
      await run([row({ name: "이교사" })]);
      await run([row()], { mode: "overwrite" });

      const [a, b, c, d] = claimCalls.map((x) => x.p_payload_hash);
      expect(a).toBe(b);
      expect(c).not.toBe(a);
      expect(d).not.toBe(a);
    });

    test("실행 기록을 만들지 못하면 500 이고 등록하지 않는다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      kit.state.rpc.fn_teacher_import_chunk_claim = () => ({
        data: null,
        error: { code: "XX000" },
      });

      const r = await run([row()]);

      expect(r.status).toBe(500);
      expect(registerCalls).toHaveLength(0);
    });
  });

  describe("요청 검증과 권한", () => {
    test.each([
      ["requestId 가 uuid 가 아님", { requestId: "abc" }],
      ["chunkIndex 가 없음", { chunkIndex: undefined }],
      ["chunkIndex 가 0", { chunkIndex: 0 }],
      ["mode 가 없음", { mode: undefined }],
      ["행이 없음", { rows: [] }],
      [
        "행이 20개를 넘음",
        {
          rows: Array.from({ length: 21 }, (_, i) =>
            row({ phone: `0100000${String(i).padStart(4, "0")}` }),
          ),
        },
      ],
      ["행에 이름 필드가 없음", { rows: [{ phone: "01011112222" }] }],
    ])("%s 이면 400 이고 아무것도 만들지 않는다", async (_label, over) => {
      const r = await post({
        requestId: REQUEST_ID,
        mode: "skip",
        rows: [row()],
        ...over,
      });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      expect(kit.state.inserts).toHaveLength(0);
    });

    test("담임은 403 NOT_SCHOOL_ADMIN 이다", async () => {
      kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

      const r = await run([row()]);

      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ error: { code: "NOT_SCHOOL_ADMIN" } });
      expect(kit.state.inserts).toHaveLength(0);
    });

    test("교사 등록이 규칙 위반으로 거부되면 코드 붙은 응답이다", async () => {
      kit.state.rpc.fn_teacher_register = () => ({
        data: null,
        error: { code: "23505" },
      });

      const r = await run([row()]);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code: "CLASS_TAKEN" } });
    });
  });
});
