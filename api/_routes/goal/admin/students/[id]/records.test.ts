// GET /api/goal/admin/students/:id/records?limit 계약 검증. record_index 내림차순 최근 N행과 전체 건수.
// 구 RLS: goal_daily_records 는 is_winning_admin() 읽기만 있었다(goal_daily_records_admin_select).

import { beforeEach, describe, expect, test, vi } from "vitest";
import { seedAdmin } from "../../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../../_lib/console/consoleTestKit.js";
import {
  createGoalAdmin,
  createGoalDb,
  type GoalDb,
} from "../../../../../_lib/goal/adminStudentsTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as GoalDb,
}));

vi.mock("../../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createGoalAdmin(kit.state, kit.db),
}));

import handler from "./records.js";

const ID = "11111111-1111-4111-8111-111111111111";
const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", { id: ID, ...query });

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createGoalDb({
    goal_daily_records: [
      ...Array.from({ length: 45 }, (_, i) => ({
        id: i + 1,
        profile_id: ID,
        record_index: i + 1,
      })),
      { id: 99, profile_id: "other", record_index: 100 },
    ],
  });
  seedAdmin(kit.state, "view", "goalStudents");
});

describe("GET /api/goal/admin/students/:id/records", () => {
  test("limit 을 생략하면 30건, record_index 내림차순, total 은 전체 건수", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const body = r.body as { items: { record_index: number }[]; total: number };
    expect(body.total).toBe(45);
    expect(body.items).toHaveLength(30);
    expect(body.items[0]?.record_index).toBe(45);
    expect(body.items[29]?.record_index).toBe(16);
    expect(kit.db.calls[0]?.range).toEqual([0, 29]);
  });

  test("더보기는 limit 을 늘려 앞에서부터 다시 받는다", async () => {
    const r = await get({ limit: "60" });
    const body = r.body as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(45);
    expect(kit.db.calls[0]?.range).toEqual([0, 59]);
  });

  test("다른 학생 기록은 섞이지 않는다", async () => {
    const r = await get({ limit: "100" });
    expect(
      (r.body as { items: { id: number }[] }).items.some((i) => i.id === 99),
    ).toBe(false);
  });

  test("limit 이 범위를 벗어나거나 id 가 uuid 가 아니면 400", async () => {
    expect((await get({ limit: "0" })).status).toBe(400);
    expect((await get({ limit: "1001" })).status).toBe(400);
    expect((await get({ id: "x" })).status).toBe(400);
  });

  test("권한 없으면 403, 쓰기 호출은 없다", async () => {
    expect((await get()).status).toBe(200);
    expect(kit.db.calls.filter((c) => c.op === "write")).toEqual([]);
    seedAdmin(kit.state, "none", "goalStudents");
    expect((await get()).status).toBe(403);
  });
});
