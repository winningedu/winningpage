// PUT /api/admin/admission/guidelines/bulk 계약 검증. 대입모집요강 행을 (연도, 대학) 키로 한 번에 upsert 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./bulk.js";

const call = (body?: unknown) => callHandler(handler, body, "PUT");

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

// parseAdmissionRowsFromXlsx 가 만드는 payload 와 같은 모양(id, raw/json/html 은 선택).
const row = (over: Record<string, unknown> = {}) => ({
  admission_year: 2026,
  university_key: "snu",
  university_name: "서울대",
  region: "서울",
  campus: null,
  source_name: "",
  source_version: "",
  jungsi_guideline_url: null,
  official_source_url: null,
  memo: null,
  detail_status: null,
  matched_hwp_name: null,
  matched_text_name: null,
  is_active: true,
  ...over,
});

const writes = () =>
  kit.state.upserts.filter((x) => x.table === "admission_university_resources");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("admissionGuidelines", "edit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/admin/admission/guidelines/bulk", () => {
  test("모든 행을 순서대로 한 번의 upsert(연도, 대학 키)로 쓰고 건수를 돌려준다", async () => {
    const items = [
      row({ university_key: "a" }),
      row({ university_key: "b", id: "6f1c1b0e-8f0a-4d63-9a43-2f6f3f0f6a11" }),
    ];

    const r = await call({ items });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ upserted: 2 });
    expect(writes()).toEqual([
      {
        table: "admission_university_resources",
        row: items,
        onConflict: "admission_year,university_key",
      },
    ]);
    expect(kit.state.upserts).toHaveLength(1);
  });

  test("빈 items 는 DB 를 부르지 않고 upserted 0", async () => {
    const r = await call({ items: [] });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ upserted: 0 });
    expect(kit.state.upserts).toHaveLength(0);
    expect(
      kit.state.reads.filter(
        (x) => x.table === "admission_university_resources",
      ),
    ).toHaveLength(0);
  });

  test.each([[undefined], [{}], [{ items: "x" }]])(
    "본문 %j 은 400",
    async (body) => {
      const r = await call(body);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(kit.state.upserts).toHaveLength(0);
    },
  );

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("admissionGuidelines", "view");

    const r = await call({ items: [row()] });

    expect(r.status).toBe(403);
    expect(kit.state.upserts).toHaveLength(0);
  });

  test("입결 메뉴 권한만으로는 403", async () => {
    grant("admissionResults", "edit");

    expect((await call({ items: [row()] })).status).toBe(403);
  });

  test("DB 쓰기 오류는 500 이고 DB 문구를 싣지 않는다", async () => {
    kit.state.insertErrors.admission_university_resources = {
      message: "secret db text",
    };

    const r = await call({ items: [row()] });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db text");
  });
});
