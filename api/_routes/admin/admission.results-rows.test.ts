// GET /api/admin/admission/results/rows 계약 검증. id 순으로 1000행씩 쪽을 나눠 읽는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ADMISSION_RESULTS_BULK_XLSX_COLUMNS } from "../../../src/lib/admissionResultsBulkXlsx.js";
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

import { resultsRowsSchema } from "../../../shared/admission/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/admission/results/rows" };

const call = (query: Record<string, string>) =>
  callRoute(handler, { method: "GET", query });

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

const readsOfResults = () =>
  kit.state.reads.filter((x) => x.table === "admission_results");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admission_results = () =>
    Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
  grant("admissionResults", "view");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/admission/results/rows", () => {
  test("첫 쪽은 id 오름차순 0..999 범위로 읽고 { items } 로 돌려준다", async () => {
    const r = await call({ offset: "0", fields: "id" });

    expect(r.status).toBe(200);
    const items = (r.body as { items: { id: number }[] }).items;
    expect(items).toHaveLength(1000);
    // 서버 응답이 브라우저가 검증하는 계약을 통과한다.
    expect(resultsRowsSchema.safeParse(r.body).success).toBe(true);
    expect(items[0]).toEqual({ id: 1 });
    expect(readsOfResults()).toEqual([
      expect.objectContaining({
        select: "id",
        orderBy: { column: "id", ascending: true },
        range: { from: 0, to: 999 },
      }),
    ]);
  });

  test("offset 은 그대로 범위 시작이 되고 offset 을 생략하면 0 이다", async () => {
    await call({ offset: "2000", fields: "id" });
    await call({ fields: "id" });

    expect(readsOfResults().map((x) => x.range)).toEqual([
      { from: 2000, to: 2999 },
      { from: 0, to: 999 },
    ]);
  });

  test("끝을 넘으면 빈 { items }", async () => {
    const r = await call({ offset: "3000", fields: "id" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
  });

  test("fields=all 은 xlsx 컬럼 29개만 고른다", async () => {
    await call({ fields: "all" });

    const select = readsOfResults()[0]?.select ?? "";
    expect(select.split(",").map((c) => c.trim())).toEqual(
      ADMISSION_RESULTS_BULK_XLSX_COLUMNS,
    );
    expect(ADMISSION_RESULTS_BULK_XLSX_COLUMNS).toHaveLength(29);
  });

  test.each([
    [{ offset: "0" }],
    [{ fields: "x" }],
    [{ fields: "id", offset: "-1" }],
    [{ fields: "id", offset: "1.5" }],
    [{ fields: "id", offset: "abc" }],
  ])("쿼리 %j 은 400 이고 읽지 않는다", async (query) => {
    const r = await call(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(readsOfResults()).toHaveLength(0);
  });

  test("입결 메뉴 권한이 없으면 403", async () => {
    grant("admissionGuidelines", "view");

    expect((await call({ fields: "id" })).status).toBe(403);
  });
});
