// GET /api/admin/tenants/member-purge-preview 계약 검증(사 #162, 결정 102.1, 102.4). 본사 tenants view 이상만,
// 스쿨멘토 사이트에서만 읽고, 학생 이름은 가려서(학년, 반, 번호, 회원번호와 함께) 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./member-purge-preview.js";

const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const get = (query: Record<string, string> = { tenantId: TENANT }) =>
  callHandler(handler, undefined, "GET", query);

const ROWS = [
  {
    profile_id: "s-1",
    name: "김하늘",
    grade: "고1",
    class_label: "3반",
    number: 5,
    protected: false,
    contract_end: "2026-09-01",
    grace_end: "2026-10-01",
  },
  {
    profile_id: "s-2",
    name: "이도윤",
    grade: "고2",
    class_label: null,
    number: null,
    protected: true,
    contract_end: "2026-09-01",
    grace_end: "2026-10-01",
  },
];

const previewArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T16:00:00Z")); // KST 2026-11-07 01:00
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "view" }],
    error: null,
  });
  previewArgs.length = 0;
  kit.state.rpc.fn_member_purge_preview = (args) => {
    previewArgs.push(args);
    return { data: ROWS, error: null };
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/member-purge-preview", () => {
  test.each([
    ["권한 없음", []],
    ["tenants none", [{ resource_key: "tenants", level: "none" }]],
    ["다른 리소스 view", [{ resource_key: "members", level: "view" }]],
  ])("%s 이면 403 이고 미리보기를 읽지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(previewArgs).toHaveLength(0);
  });

  test("학생 이름은 가리고 학년, 반, 번호, 회원번호, 보호 표시를 그대로 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(previewArgs).toEqual([{ p_tenant: TENANT }]);
    expect((r.body as { students: unknown[] }).students).toEqual([
      {
        id: "s-1",
        name: "김*늘",
        grade: "고1",
        classLabel: "3반",
        number: 5,
        protected: false,
      },
      {
        id: "s-2",
        name: "이*윤",
        grade: "고2",
        classLabel: null,
        number: null,
        protected: true,
      },
    ]);
    expect(JSON.stringify(r.body)).not.toMatch(/김하늘|이도윤/);
  });

  test("삭제 가능일은 유예 종료 다음 날이고 D-day 는 KST 날짜로 센다", async () => {
    kit.state.rpc.fn_member_purge_preview = () => ({
      data: [{ ...ROWS[0], grace_end: "2026-11-09" }],
      error: null,
    });

    const r = await get();

    expect(r.body).toMatchObject({
      contractEnd: "2026-09-01",
      graceEnd: "2026-11-09",
      deletableFrom: "2026-11-10",
      dDay: 3,
    });
  });

  test("삭제 가능일이 지나면 D-day 는 0 이하다", async () => {
    const r = await get();

    expect(r.body).toMatchObject({ deletableFrom: "2026-10-02", dDay: -36 });
  });

  test("학생 없는 한 줄(profile_id 없음)은 날짜만 알리고 학생 목록은 비어 있다", async () => {
    kit.state.rpc.fn_member_purge_preview = () => ({
      data: [
        {
          profile_id: null,
          name: null,
          grade: null,
          class_label: null,
          number: null,
          protected: null,
          contract_end: "2026-09-01",
          grace_end: "2026-10-01",
        },
      ],
      error: null,
    });

    const r = await get();

    expect(r.body).toMatchObject({
      contractEnd: "2026-09-01",
      graceEnd: "2026-10-01",
      students: [],
    });
  });

  test("계약 종료일이 없는 기관은 날짜 없이 빈 목록이다", async () => {
    kit.state.rpc.fn_member_purge_preview = () => ({ data: [], error: null });

    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      contractEnd: null,
      graceEnd: null,
      deletableFrom: null,
      dDay: null,
      students: [],
    });
  });

  test("유예 종료일을 정할 수 없으면 삭제 가능일과 D-day 는 null 이다", async () => {
    kit.state.rpc.fn_member_purge_preview = () => ({
      data: [{ ...ROWS[0], grace_end: null }],
      error: null,
    });

    const r = await get();

    expect(r.body).toMatchObject({
      contractEnd: "2026-09-01",
      graceEnd: null,
      deletableFrom: null,
      dDay: null,
    });
  });

  test.each([
    ["tenantId 없음", {}],
    ["uuid 가 아닌 tenantId", { tenantId: "tenant-7" }],
  ])("%s 이면 400 이다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(previewArgs).toHaveLength(0);
  });

  test("스쿨멘토가 아닌 사이트에서는 404 이다", async () => {
    vi.stubEnv("SITE", "winning");

    const r = await get();

    expect(r.status).toBe(404);
    expect(previewArgs).toHaveLength(0);
  });

  test("GET 이외의 메서드는 405 이다", async () => {
    const r = await callHandler(handler, undefined, "POST", {
      tenantId: TENANT,
    });

    expect(r.status).toBe(405);
  });

  test("DB 함수가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rpc.fn_member_purge_preview = () => ({
      data: null,
      error: { code: "XX000" },
    });

    const r = await get();

    expect(r.status).toBe(500);
  });
});
