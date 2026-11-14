// POST /api/console/org-info/confirm 계약 검증(W17, 교 #230, #231). 최종확인은 한 번만 되고 이후 기관 정보는 조회 전용이다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  schoolAdminActor,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  confirmed: false,
  current: "2026-11-05T00:30:00.654321+00:00",
}));

// 키트의 가짜 쿼리 빌더에는 .is() 가 없어 .eq() 와 같은 필터 기록으로 대신한다.
vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const fake = createFakeAdmin(kit.state);
    const from = fake.from;
    fake.from = (table: string) => {
      const chain = from(table);
      chain.is = chain.eq;
      return chain;
    };
    return fake;
  },
}));

import handler from "./confirm.js";

const REVIEWED = "2026-11-05T00:30:00.654321+00:00";
// 관리자가 검토한 화면의 기관 id 와 갱신 시각을 싣는다.
const post = (body: Record<string, unknown> = {}) =>
  callHandler(handler, { tenantId: "tenant-1", updatedAt: REVIEWED, ...body });

beforeEach(() => {
  kit.state = createKitState();
  kit.confirmed = false;
  kit.current = REVIEWED;
  kit.state.actor = schoolAdminActor();
  // 조건부 update(updated_at 필터가 있는 호출)는 확정 전이고 검토한 시각 그대로일 때만 한 행을 돌려준다.
  // 그 밖의 읽기는 확정 여부를 돌려준다.
  kit.state.rows.tenants = (filters) =>
    "updated_at" in filters
      ? kit.confirmed || filters.updated_at !== kit.current
        ? []
        : [{ id: "tenant-1" }]
      : { info_confirmed_at: kit.confirmed ? "2026-11-05T01:00:00Z" : null };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("POST /api/console/org-info/confirm", () => {
  test("확정 전이면 info_confirmed_at 을 지금으로 한 번 기록하고 감사 로그를 남긴다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T01:00:00Z"));

    const r = await post();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      infoConfirmedAt: "2026-11-05T01:00:00.000Z",
    });
    expect(kit.state.updates).toEqual([
      {
        table: "tenants",
        values: { info_confirmed_at: "2026-11-05T01:00:00.000Z" },
        filters: {
          id: "tenant-1",
          info_confirmed_at: null,
          updated_at: REVIEWED,
        },
      },
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "settings_change",
      resource_key: "console.org-info",
      target_id: "tenant-1",
      teacher_id: "admin-teacher-1",
      meta: { step: "confirm" },
    });
  });

  test("이미 확정됐으면 409 ALREADY_CONFIRMED 이고 감사 로그를 남기지 않는다", async () => {
    kit.confirmed = true;

    const r = await post();

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "ALREADY_CONFIRMED" } });
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("검토한 뒤 정보가 바뀌었으면(갱신 시각이 다르면) 409 INFO_CHANGED 이고 확정도 감사 로그도 없다", async () => {
    kit.current = "2026-11-05T00:45:00.000001+00:00";

    const r = await post();

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "INFO_CHANGED" } });
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("화면이 그린 기관 id 가 세션 기관과 다르면 409 SESSION_CHANGED 이고 확정하지 않는다", async () => {
    const r = await post({ tenantId: "tenant-2" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "SESSION_CHANGED" } });
    expect(kit.state.updates).toHaveLength(0);
  });

  test.each([
    ["기관 id 없음", { tenantId: undefined }],
    ["검토 시각 없음", { updatedAt: undefined }],
    ["검토 시각이 문자열이 아님", { updatedAt: 5 }],
  ])("%s 이면 400 이고 확정하지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(kit.state.updates).toHaveLength(0);
  });

  test("담임은 403 NOT_SCHOOL_ADMIN", async () => {
    kit.state.actor = schoolAdminActor({ kind: "homeroom" });

    const r = await post();

    expect(r.status).toBe(403);
    expect(kit.state.updates).toHaveLength(0);
  });

  test("본사 대행은 403 FORBIDDEN", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "session-1",
    });

    const r = await post();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.updates).toHaveLength(0);
  });

  test("POST 가 아니면 405", async () => {
    const r = await callHandler(handler, undefined, "GET");

    expect(r.status).toBe(405);
  });

  test("감사 로그를 남기지 못하면 500 이다(남기지 못한 확정은 성공으로 끝나지 않는다)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.insertError = { code: "XX000" };

    const r = await post();

    expect(r.status).toBe(500);
  });
});
