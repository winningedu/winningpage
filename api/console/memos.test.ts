// /api/console/memos 계약 검증(W9 교사 메모). 열람 범위, 저장의 멱등, 범위 밖, 감사 로그.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./memos.js";

const REQUEST_ID = "0b4c2a54-6d1e-4a8c-9a3a-1f2e3d4c5b6a";

const get = (query: Record<string, string> = { studentId: "s1" }) =>
  callHandler(handler, undefined, "GET", query);
const post = (body: unknown) => callHandler(handler, body, "POST");

const memo = (over: Record<string, unknown>) => ({
  id: "m1",
  tenant_id: "tenant-1",
  student_id: "s1",
  author_teacher_id: "t-home",
  proxy_session_id: null,
  body: "진로 상담 필요",
  request_id: REQUEST_ID,
  created_at: "2026-10-28T01:00:00Z",
  hidden_at: null,
  ...over,
});

const MEMOS = [
  memo({ id: "m1" }),
  memo({
    id: "m2",
    author_teacher_id: "t-admin",
    body: "목표시간 점검",
    created_at: "2026-10-14T01:00:00Z",
  }),
  memo({ id: "m3", body: "지운 메모", hidden_at: "2026-10-30T00:00:00Z" }),
  memo({ id: "m4", student_id: "s2", body: "다른 학생" }),
  memo({
    id: "m5",
    author_teacher_id: null,
    proxy_session_id: "ps1",
    body: "본사 대행 입력",
    created_at: "2026-10-20T01:00:00Z",
  }),
  memo({
    id: "m6",
    author_teacher_id: null,
    proxy_session_id: "ps2",
    body: "다른 대행 세션 입력",
    created_at: "2026-10-21T01:00:00Z",
  }),
];

const homeroom = () =>
  schoolAdminActor({
    kind: "homeroom",
    class_ids: ["c-A"],
    teacher_id: "t-home",
  });

type Item = {
  id: string;
  body: string;
  authorName: string;
  canDelete: boolean;
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = homeroom();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        {
          tenant_id: "tenant-1",
          school_year: 2026,
          status: "active",
          student_id: "s1",
          grade: "고2",
          class_id: "c-A",
          number: 1,
        },
        {
          tenant_id: "tenant-1",
          school_year: 2026,
          status: "active",
          student_id: "s2",
          grade: "고2",
          class_id: "c-B",
          number: 2,
        },
      ],
      f,
    );
  kit.state.rows.teachers = (f) =>
    matchRows(
      [
        { id: "t-home", name: "박지훈", tenant_id: "tenant-1" },
        { id: "t-admin", name: "최민정", tenant_id: "tenant-1" },
      ],
      f,
    );
  kit.state.rows.teacher_memos = (f) => matchRows(MEMOS, f);
});

describe("GET /api/console/memos", () => {
  test("a homeroom sees every visible memo of the student, newest first, and can delete only its own", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect((r.body as { memos: Item[] }).memos).toEqual([
      expect.objectContaining({
        id: "m1",
        authorName: "박지훈",
        canDelete: true,
      }),
      expect.objectContaining({
        id: "m6",
        canDelete: false,
      }),
      expect.objectContaining({
        id: "m5",
        canDelete: false,
      }),
      expect.objectContaining({
        id: "m2",
        authorName: "최민정",
        canDelete: false,
      }),
    ]);
  });

  test("opening the list leaves a view audit record and a failing audit write fails the request", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(kit.state.inserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        action: "view",
        resource_key: "teacherMemoList",
        target_id: "s1",
      },
    });

    kit.state.insertErrors.admin_access_logs = { message: "down" };
    expect((await get()).status).toBe(500);
  });

  test("a rejected list request leaves no view audit record", async () => {
    await get({ studentId: "s2" });
    expect(kit.state.inserts).toEqual([]);
  });

  test("a proxy session sees memos like a school admin, only those written in the same proxy session, and may delete them", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "ps1",
    });
    const memos = ((await get()).body as { memos: Item[] }).memos;
    expect(memos.map((m) => [m.id, m.canDelete])).toEqual([["m5", true]]);
    expect(memos[0]?.authorName).toBe("본사 대행");
  });

  test("a school admin sees only the own memos", async () => {
    kit.state.actor = schoolAdminActor({ teacher_id: "t-admin" });
    const memos = ((await get()).body as { memos: Item[] }).memos;
    expect(memos.map((m) => m.id)).toEqual(["m2"]);
    expect(memos[0]?.canDelete).toBe(true);
  });

  test("a missing studentId is 400 and a student out of scope is 404", async () => {
    expect((await get({})).status).toBe(400);
    expect((await get({ studentId: "s2" })).status).toBe(404);
  });
});

describe("POST /api/console/memos", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    studentId: "s1",
    body: "  오늘 상담 내용  ",
    requestId: REQUEST_ID,
    ...over,
  });

  test("saves the trimmed body for the author, writes one audit record and returns the memo", async () => {
    kit.state.rows.teacher_memos = (f) =>
      matchRows(
        [memo({ id: "new", body: "오늘 상담 내용", request_id: REQUEST_ID })],
        f,
      );
    const r = await post(body());

    expect(r.status).toBe(200);
    expect(
      kit.state.inserts.find((i) => i.table === "teacher_memos")?.row,
    ).toEqual({
      tenant_id: "tenant-1",
      student_id: "s1",
      author_teacher_id: "t-home",
      body: "오늘 상담 내용",
      request_id: REQUEST_ID,
    });
    expect((r.body as { memo: Item }).memo).toMatchObject({
      id: "new",
      authorName: "박지훈",
      canDelete: true,
    });
    const audit = kit.state.inserts.filter(
      (i) => i.table === "admin_access_logs",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.row).toMatchObject({
      action: "update",
      resource_key: "teacherMemo",
      target_id: "new",
    });
  });

  test("a blank body, a body over 2000 characters and a bad request id are 400 and write nothing", async () => {
    for (const bad of [
      body({ body: "   " }),
      body({ body: "가".repeat(2001) }),
      body({ requestId: "not-a-uuid" }),
      body({ studentId: "" }),
    ]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(kit.state.inserts).toEqual([]);
  });

  test("a student out of scope is 404 and writes nothing", async () => {
    expect((await post(body({ studentId: "s2" }))).status).toBe(404);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a proxy session writes the memo with the proxy session as author and no teacher", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "ps1",
    });
    kit.state.rows.teacher_memos = (f) =>
      matchRows(
        [
          memo({
            id: "new",
            author_teacher_id: null,
            proxy_session_id: "ps1",
            body: "오늘 상담 내용",
          }),
        ],
        f,
      );

    const r = await post(body());

    expect(r.status).toBe(200);
    expect(
      kit.state.inserts.find((i) => i.table === "teacher_memos")?.row,
    ).toEqual({
      tenant_id: "tenant-1",
      student_id: "s1",
      proxy_session_id: "ps1",
      body: "오늘 상담 내용",
      request_id: REQUEST_ID,
    });
    expect((r.body as { memo: Item }).memo).toMatchObject({
      id: "new",
      authorName: "본사 대행",
      canDelete: true,
    });
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs"),
    ).toHaveLength(1);
  });

  test("an actor with neither a teacher nor a proxy session cannot write", async () => {
    kit.state.actor = schoolAdminActor({ teacher_id: null });
    expect((await post(body())).status).toBe(403);
    expect(kit.state.inserts).toEqual([]);
  });

  test("the same request id with the same content replays the stored memo without a second audit record", async () => {
    kit.state.insertErrors.teacher_memos = { code: "23505" };
    kit.state.rows.teacher_memos = (f) =>
      matchRows(
        [memo({ id: "m1", body: "오늘 상담 내용", request_id: REQUEST_ID })],
        f,
      );
    const r = await post(body());
    expect(r.status).toBe(200);
    expect((r.body as { memo: Item }).memo.id).toBe("m1");
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs"),
    ).toEqual([]);
  });

  test("the same request id with different content is 400 IDEMPOTENCY_KEY_MISMATCH", async () => {
    kit.state.insertErrors.teacher_memos = { code: "23505" };
    kit.state.rows.teacher_memos = (f) =>
      matchRows([memo({ id: "m1", body: "다른 내용" })], f);
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_MISMATCH" },
    });
  });
});
