// GET, PUT /api/admin/admission/active-year 계약 검증. 공개 연도는 app_settings 한 키만 읽고 쓴다.

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

import { activeYearSchema } from "../../../shared/admission/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/admission/active-year" };

const call = (method: string, body?: unknown) =>
  callRoute(handler, { method, body });

function grant(level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "admissionGuidelines", level }],
    error: null,
  });
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.app_settings = () => ({ value: 2026 });
  grant("edit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/admission/active-year", () => {
  test("저장된 연도를 { year } 로 돌려주고 그 키만 읽는다", async () => {
    let filters: Record<string, unknown> = {};
    kit.state.rows.app_settings = (f) => {
      filters = f;
      return { value: 2026 };
    };

    const r = await call("GET");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ year: 2026 });
    // 서버 응답이 브라우저가 검증하는 계약을 통과한다.
    expect(activeYearSchema.safeParse(r.body).success).toBe(true);
    expect(filters).toEqual({ key: "admission_active_year" });
  });

  test("행이 없으면 404 NOT_FOUND 이고 기본값으로 채우지 않는다", async () => {
    kit.state.rows.app_settings = () => null;

    const r = await call("GET");

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "공개 연도가 아직 지정되지 않았습니다.",
    });
  });

  test.each([["2026"], [0], [-1], [2026.5], [null]])(
    "값 %j 이 양의 정수가 아니면 404",
    async (value) => {
      kit.state.rows.app_settings = () => ({ value });

      const r = await call("GET");

      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    },
  );

  test("보기 권한만으로 읽을 수 있다", async () => {
    grant("view");

    expect((await call("GET")).status).toBe(200);
  });
});

describe("PUT /api/admin/admission/active-year", () => {
  test("app_settings 의 그 키 하나만 upsert 하고 { year } 를 돌려준다", async () => {
    const r = await call("PUT", { year: 2027 });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ year: 2027 });
    expect(kit.state.upserts).toHaveLength(1);
    const [u] = kit.state.upserts;
    expect(u?.table).toBe("app_settings");
    expect(u?.onConflict).toBe("key");
    expect(Object.keys(u?.row ?? {}).sort()).toEqual([
      "key",
      "updated_at",
      "value",
    ]);
    expect(u?.row).toMatchObject({ key: "admission_active_year", value: 2027 });
    expect(Number.isNaN(Date.parse(String(u?.row.updated_at)))).toBe(false);
  });

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("view");

    const r = await call("PUT", { year: 2027 });

    expect(r.status).toBe(403);
    expect(kit.state.upserts).toHaveLength(0);
  });

  test.each([
    [{ year: 1999 }],
    [{ year: 2101 }],
    [{ year: 2026.5 }],
    [{ year: "2026" }],
    [{}],
    [undefined],
  ])("본문 %j 은 400 이고 화면과 같은 문구로 막는다", async (bad) => {
    const r = await call("PUT", bad);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "연도는 2000~2100 사이 정수로 입력해 주세요.",
    });
    expect(kit.state.upserts).toHaveLength(0);
  });

  test("DB 쓰기 오류는 500 이고 DB 문구를 싣지 않는다", async () => {
    kit.state.insertErrors.app_settings = { message: "secret db text" };

    const r = await call("PUT", { year: 2027 });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db text");
  });
});
