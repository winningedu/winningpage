// GET /api/admin/admission/results/count 계약 검증. 행을 내려받지 않고 건수만 센다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { resultsCountSchema } from "../../../shared/admission/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/admission/results/count" };

const call = (method = "GET") => callRoute(handler, { method });

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admission_results = () =>
    Array.from({ length: 43170 }, (_, i) => ({ id: i + 1 }));
  grant("admissionResults", "view");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/admission/results/count", () => {
  test("id 만 head 로 세어 { total } 을 돌려준다", async () => {
    const r = await call();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 43170 });
    // 서버 응답이 브라우저가 검증하는 계약을 통과한다.
    expect(resultsCountSchema.safeParse(r.body).success).toBe(true);
    expect(
      kit.state.reads.filter((x) => x.table === "admission_results"),
    ).toEqual([
      expect.objectContaining({
        select: "id",
        selectOptions: { count: "exact", head: true },
      }),
    ]);
  });

  test("0행이면 total 0", async () => {
    kit.state.rows.admission_results = () => [];

    const r = await call();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 0 });
  });

  test("입결 메뉴 권한이 없으면 403", async () => {
    grant("admissionGuidelines", "view");

    expect((await call()).status).toBe(403);
  });

  test("DB 오류는 500 이고 DB 문구를 싣지 않는다", async () => {
    kit.state.rows.admission_results = () => {
      throw new Error("secret db text");
    };

    const r = await call();

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db text");
  });
});
