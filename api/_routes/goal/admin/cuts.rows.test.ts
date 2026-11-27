// GET /api/goal/admin/cuts/rows 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { cutsRowsResponse } from "../../../../shared/goal/admin-cuts.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
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

const handler = { app, path: "/api/goal/admin/cuts/rows" };

const MENU = "goalUniversityCuts";
const call = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const cut = (id: number) => ({
  id,
  cut_type: "normal",
  university_name: `대학${id}`,
  department_name: "학과",
  avg_cut: 2,
  source: "manual",
  source_year: null,
  is_active: id % 2 === 0,
  note: null,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  kit.state = createKitState();
  // 일부러 id 순서를 섞어 둔다. 비활성 행도 목록에 나와야 한다(옛 RLS 는 관리자에게 전부 보였다).
  kit.db = createCutsDb({
    goal_university_cuts: [cut(3), cut(1), cut(2)],
  });
});

describe("GET /api/goal/admin/cuts/rows", () => {
  test("id 오름차순으로 화면이 읽던 아홉 컬럼만 돌려준다(비활성 행 포함)", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await call();
    expect(() => cutsRowsResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    const body = r.body as { items: { id: number }[]; next: number | null };
    expect(body.items.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(body.next).toBeNull();
    const read = kit.db.calls.find((c) => c.op === "select");
    expect(read?.columns).toBe(
      "id, cut_type, university_name, department_name, avg_cut, source, source_year, is_active, note",
    );
    expect(read?.orders).toEqual([["id", true]]);
    expect(read?.range).toEqual([0, 999]);
  });

  test("청크가 가득 차면 next 로 다음 시작 위치를 준다", async () => {
    seedAdmin(kit.state, "view", MENU);
    kit.db.tables.goal_university_cuts = Array.from({ length: 1000 }, (_, i) =>
      cut(i + 1),
    );
    const r = await call({ from: "0" });
    expect((r.body as { next: number | null }).next).toBe(1000);
    const second = await call({ from: "1000" });
    expect(second.body).toEqual({ items: [], next: null });
    expect(kit.db.calls.at(-1)?.range).toEqual([1000, 1999]);
  });

  test("from 이 음수면 400", async () => {
    seedAdmin(kit.state, "view", MENU);
    expect((await call({ from: "-1" })).status).toBe(400);
  });

  test("메뉴 권한이 없으면 403 이고 DB 를 읽지 않는다", async () => {
    seedAdmin(kit.state, "none", MENU);
    expect((await call()).status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});
