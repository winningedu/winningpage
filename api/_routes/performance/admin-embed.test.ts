// POST /api/performance/admin-embed 오류 계약. problem 형식이고 메뉴 권한은 요구하지 않는다
// (지식 DB 일괄 반영 화면의 backfill 도 같은 경로를 쓴다).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import { callHandler } from "../../_lib/tenantRoute.testkit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));
vi.mock("../../_lib/afterResponse.js", () => ({
  scheduleAfterResponse: () => {},
}));

import { app } from "../app.js";

const call = (body: unknown) =>
  callHandler({ app, path: "/api/performance/admin-embed" }, body);

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin-embed 오류", () => {
  test("embed-one 에 id 가 없으면 400 ID_REQUIRED", async () => {
    const r = await call({ action: "embed-one" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "ID_REQUIRED",
      detail: "id가 필요합니다.",
    });
  });

  test("모르는 action 은 400 UNKNOWN_ACTION", async () => {
    const r = await call({ action: "nope" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "UNKNOWN_ACTION",
      detail: "알 수 없는 action입니다. 'embed-one' 또는 'backfill'.",
    });
  });

  test("임베딩 중 예외는 500 EMBED_FAILED 이고 원인 문구를 detail 로 싣는다", async () => {
    kit.state.rows.winning_assessment_knowledge_items = () => {
      throw new Error("db down");
    };

    const r = await call({ action: "embed-one", id: "k1" });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "EMBED_FAILED" });
    expect(r.body).toMatchObject({ detail: "db down" });
  });

  test("메뉴 권한이 하나도 없는 관리자도 막지 않는다(권한 조회를 하지 않는다)", async () => {
    const r = await call({ action: "embed-one" });

    expect(kit.state.events).not.toContain(
      "rpc:fn_admin_effective_permissions",
    );
    expect(r.status).toBe(400);
  });
});
