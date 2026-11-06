// POST /api/admin/tenants/member-purge 계약 검증(사 #162, #176). 본사 tenants edit 권한만, 기관 하나만,
// 유예가 끝났을 때만 익명화하고 로그의 실행자는 그 본사 관리자다.

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

import handler from "./member-purge.js";

const post = (body: unknown, method = "POST") =>
  callHandler(handler, body, method);

const STUDENT_A = "a1111111-1111-4111-8111-111111111111";
const STUDENT_B = "b2222222-2222-4222-8222-222222222222";
const BODY = { tenantId: "tenant-7", targetIds: [STUDENT_A, STUDENT_B] };

const anonymizeArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "edit" }],
    error: null,
  });
  anonymizeArgs.length = 0;
  kit.state.rpc.fn_anonymize_expired_b2b_members = (args) => {
    anonymizeArgs.push(args);
    return {
      data: [
        {
          tenants_processed: 1,
          members_anonymized: 3,
          members_protected: 1,
          grace_end: "2026-10-01",
          not_yet: false,
          members_skipped: 2,
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

describe("POST /api/admin/tenants/member-purge", () => {
  test.each([
    ["권한 없음", []],
    ["tenants view 만", [{ resource_key: "tenants", level: "view" }]],
    ["다른 리소스 edit", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 아무것도 지우지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await post(BODY);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("유예가 끝나지 않았으면 409 NOT_YET 과 유예 종료일을 돌려준다", async () => {
    kit.state.rpc.fn_anonymize_expired_b2b_members = () => ({
      data: [
        {
          tenants_processed: 0,
          members_anonymized: 0,
          members_protected: 0,
          grace_end: "2026-12-01",
          not_yet: true,
        },
      ],
      error: null,
    });

    const r = await post(BODY);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      error: { code: "NOT_YET" },
      graceEndsOn: "2026-12-01",
    });
  });

  test("성공하면 그 기관만, 로그 실행자를 본사 관리자로 해서 익명화하고 건수를 돌려준다", async () => {
    const r = await post(BODY);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deleted: 3, excluded: 1, skipped: 2 });
    expect(anonymizeArgs).toEqual([
      {
        p_tenant: "tenant-7",
        p_actor_profile: "hq-1",
        p_actor_email: "hq@example.com",
        p_targets: [STUDENT_A, STUDENT_B],
      },
    ]);
  });

  test.each([
    ["tenantId 없음", {}],
    ["빈 tenantId", { tenantId: "" }],
    ["문자열이 아닌 tenantId", { tenantId: 7 }],
    ["본문 없음", undefined],
  ])("%s 이면 400 이고 아무것도 지우지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(anonymizeArgs).toHaveLength(0);
  });

  test.each([
    ["targetIds 없음", { tenantId: "tenant-7" }],
    ["빈 targetIds", { tenantId: "tenant-7", targetIds: [] }],
    ["배열이 아닌 targetIds", { tenantId: "tenant-7", targetIds: STUDENT_A }],
    [
      "uuid 가 아닌 항목",
      { tenantId: "tenant-7", targetIds: [STUDENT_A, "not-a-uuid"] },
    ],
    ["문자열이 아닌 항목", { tenantId: "tenant-7", targetIds: [STUDENT_A, 7] }],
    [
      "중복된 항목",
      { tenantId: "tenant-7", targetIds: [STUDENT_A, STUDENT_A] },
    ],
    [
      "5,000개 초과",
      {
        tenantId: "tenant-7",
        targetIds: Array.from(
          { length: 5001 },
          (_, i) =>
            `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`,
        ),
      },
    ],
  ])("%s 이면 400 이고 아무것도 지우지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("5,000개까지는 받는다", async () => {
    const targetIds = Array.from(
      { length: 5000 },
      (_, i) => `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`,
    );

    const r = await post({ tenantId: "tenant-7", targetIds });

    expect(r.status).toBe(200);
    expect(anonymizeArgs[0]?.p_targets).toHaveLength(5000);
  });

  test("POST 이외의 메서드는 405 이다", async () => {
    const r = await post({ tenantId: "tenant-7" }, "GET");

    expect(r.status).toBe(405);
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("DB 함수가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rpc.fn_anonymize_expired_b2b_members = () => ({
      data: null,
      error: { code: "XX000" },
    });

    const r = await post(BODY);

    expect(r.status).toBe(500);
  });
});
