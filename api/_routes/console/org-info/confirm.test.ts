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

const post = () => callHandler(handler, {});

beforeEach(() => {
  kit.state = createKitState();
  kit.confirmed = false;
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => (kit.confirmed ? [] : [{ id: "tenant-1" }]);
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
        filters: { id: "tenant-1", info_confirmed_at: null },
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
