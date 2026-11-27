// POST /api/goal/admin/cuts/bulk 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { cutsBulkResponse } from "../../../../shared/goal/admin-cuts.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  type CutsCall,
  type CutsDb,
  createCutsAdmin,
  createCutsDb,
} from "../../../_lib/goal/cutsTestKit.js";
import { callHandler } from "../../../_lib/tenantRoute.testkit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as CutsDb,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createCutsAdmin(kit.state, kit.db),
}));

import { app } from "../../app.js";

const handler = { app, path: "/api/goal/admin/cuts/bulk" };

const MENU = "goalUniversityCuts";
const call = (body: unknown) => callHandler(handler, body, "POST");

const newRow = (n: number, over: Record<string, unknown> = {}) => ({
  cut_type: "normal",
  university_key: `대학${n}`,
  university_name: `대학${n}`,
  department_key: "학과",
  department_name: "학과",
  avg_cut: 2.5,
  source: "manual",
  source_year: null,
  is_active: true,
  note: null,
  ...over,
});
const oldRow = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  ...newRow(id),
  ...over,
});

const writes = () => kit.db.calls.filter((c) => c.op !== "select");

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createCutsDb({
    goal_university_cuts: [
      { id: 7, cut_type: "normal", university_name: "대학7" },
      { id: 8, cut_type: "jungsi", university_name: "대학8" },
    ],
  });
});

describe("POST /api/goal/admin/cuts/bulk", () => {
  test("id 없는 행은 insert, id 있는 행은 id 기준 upsert 로 따로 보낸다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({ rows: [oldRow(7), newRow(1), newRow(2)] });
    expect(() => cutsBulkResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 2, updated: 1 });
    const [first, second] = writes() as [CutsCall, CutsCall];
    expect(first.op).toBe("insert");
    const inserted = first.values as Record<string, unknown>[];
    expect(inserted).toHaveLength(2);
    expect(inserted.every((v) => !("id" in v))).toBe(true);
    expect(second.op).toBe("upsert");
    expect(second.onConflict).toBe("id");
    expect(second.values as unknown[]).toHaveLength(1);
  });

  test("보기 권한만 있으면 403 이고 아무것도 쓰지 않는다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await call({ rows: [newRow(1)] });
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("501행이면 400, 0행도 400", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const many = Array.from({ length: 501 }, (_, i) => newRow(i + 1));
    expect((await call({ rows: many })).status).toBe(400);
    expect((await call({ rows: [] })).status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
  });
});

describe("POST /api/goal/admin/cuts/bulk 검증", () => {
  test.each([
    ["수시 컷이 9 초과", newRow(1, { avg_cut: 9.5 })],
    ["수시 컷이 1 미만", newRow(1, { avg_cut: 0.5 })],
    ["정시 컷이 100 초과", newRow(1, { cut_type: "jungsi", avg_cut: 100.5 })],
    ["대학 key 가 이름과 다름", newRow(1, { university_key: "다른" })],
    ["학과 key 가 이름과 다름", newRow(1, { department_key: "다른" })],
    ["컷 종류 모름", newRow(1, { cut_type: "etc" })],
    ["출처 모름", newRow(1, { source: "csv" })],
    ["기준 연도 범위 밖", newRow(1, { source_year: 20260 })],
    ["컬럼이 아닌 키", newRow(1, { price: 1 })],
    ["id 가 0", oldRow(7, { id: 0 })],
  ])("%s 이면 400 이고 아무것도 쓰지 않는다", async (_name, row) => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({ rows: [row] });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(writes()).toHaveLength(0);
  });

  test("정시 컷 0 과 100 은 합법이고 컷 값 null 도 받는다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({
      rows: [
        newRow(1, { cut_type: "jungsi", avg_cut: 0 }),
        newRow(2, { cut_type: "jungsi", avg_cut: 100 }),
        newRow(3, { avg_cut: null }),
      ],
    });
    expect(r.status).toBe(200);
  });

  test("created_at, updated_at 은 조용히 떼고 쓴다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({
      rows: [newRow(1, { created_at: "x", updated_at: "y" })],
    });
    expect(r.status).toBe(200);
    const written = (writes()[0] as CutsCall).values as Record<
      string,
      unknown
    >[];
    expect(written[0]).not.toHaveProperty("created_at");
    expect(written[0]).not.toHaveProperty("updated_at");
  });
});

describe("POST /api/goal/admin/cuts/bulk 기존 행", () => {
  test("없는 id 가 하나라도 있으면 404 이고 어느 쪽도 쓰지 않는다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({ rows: [newRow(1), oldRow(7), oldRow(999)] });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(writes()).toHaveLength(0);
  });

  test("기존 행의 컷 종류를 바꾸면 400 이고 쓰지 않는다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    // 8번은 jungsi 인데 normal 로 바꾸려 한다(등급과 백분위 혼입 방지).
    const r = await call({ rows: [oldRow(8, { cut_type: "normal" })] });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(writes()).toHaveLength(0);
  });

  test("같은 id 가 두 번 들어 있으면 400", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await call({ rows: [oldRow(7), oldRow(7)] });
    expect(r.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("자연키가 겹치는 신규 행은 덮어쓰지 않고 409 로 알린다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    kit.db.unique.goal_university_cuts = [
      "cut_type",
      "university_key",
      "department_key",
    ];
    kit.db.tables.goal_university_cuts = [{ id: 1, ...newRow(1), avg_cut: 3 }];
    const r = await call({ rows: [newRow(1, { avg_cut: 4 })] });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "DB_UNIQUE_VIOLATION" });
    expect(kit.db.tables.goal_university_cuts?.[0]?.avg_cut).toBe(3);
  });
});
