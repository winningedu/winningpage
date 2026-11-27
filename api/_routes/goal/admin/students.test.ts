// GET /api/goal/admin/students 계약 검증. 구 브라우저 3단계 조회(profiles 검색, goal_student_state 페이지,
// goal_students + profiles 병합)를 서버로 옮긴 것이라 정렬, 필터, 검색 절단 표시를 그대로 단언한다.
// 구 RLS: goal_students, goal_student_state(security_invoker 뷰), goal_probability_logs, goal_daily_records 는
// is_winning_admin() 읽기만 있고 쓰기 정책이 없었다. 이 라우트는 읽기 전용이라 쓰기 호출이 0이어야 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { goalStudentsResponse } from "../../../../shared/goal/admin-students.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import { callRoute } from "../../../_lib/adminRoute.testkit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  createGoalAdmin,
  createGoalDb,
  type GoalDb,
} from "../../../_lib/goal/adminStudentsTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as GoalDb,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createGoalAdmin(kit.state, kit.db),
}));

import { app } from "../../app.js";

const handler = { app, path: "/api/goal/admin/students" };

const get = (
  query: Record<string, string> = {},
  zone: string | null = "Asia/Seoul",
) =>
  callRoute(handler, {
    method: "GET",
    query,
    headers: {
      authorization: "Bearer token",
      ...(zone ? { "x-time-zone": zone } : {}),
    },
  });

const stateRow = (id: string, over: Record<string, unknown> = {}) => ({
  profile_id: id,
  status: "active",
  record_count: 3,
  last_record_date: "2026-11-24",
  onboarded_at: "2026-11-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createGoalDb({
    goal_student_state: [],
    goal_students: [],
    profiles: [],
  });
  seedAdmin(kit.state, "view", "goalStudents");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/goal/admin/students", () => {
  test("목록에 학생과 프로필을 병합하고 total 을 돌려준다", async () => {
    kit.db.tables.goal_student_state = [stateRow("s1")];
    kit.db.tables.goal_students = [
      { profile_id: "s1", grade: "고2", school_type: "일반고", memo: "x" },
    ];
    kit.db.tables.profiles = [
      { id: "s1", name: "김학생", phone: "01012345678", email: "a@b.c" },
    ];
    const r = await get();
    expect(() => goalStudentsResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          ...stateRow("s1"),
          student: { profile_id: "s1", grade: "고2", school_type: "일반고" },
          profile: { id: "s1", name: "김학생", phone: "01012345678" },
        },
      ],
      total: 1,
      searchTruncated: false,
    });
  });

  test("읽기 전용이라 쓰기 호출이 없다", async () => {
    kit.db.tables.goal_student_state = [stateRow("s1")];
    await get();
    expect(kit.db.calls.filter((c) => c.op === "write")).toEqual([]);
  });

  test("view 권한 읽기 허용, 권한 없으면 403", async () => {
    expect((await get()).status).toBe(200);
    seedAdmin(kit.state, "none", "goalStudents");
    expect((await get()).status).toBe(403);
  });

  test("정렬은 onboarded_at 내림차순(null 먼저) 뒤 profile_id 오름차순이다", async () => {
    kit.db.tables.goal_student_state = [
      stateRow("b", { onboarded_at: "2026-11-02T00:00:00Z" }),
      stateRow("z", { onboarded_at: null }),
      stateRow("a", { onboarded_at: null }),
      stateRow("c", { onboarded_at: "2026-11-05T00:00:00Z" }),
    ];
    const r = await get();
    const ids = (r.body as { items: { profile_id: string }[] }).items.map(
      (i) => i.profile_id,
    );
    expect(ids).toEqual(["a", "z", "c", "b"]);
    const call = kit.db.calls.find((c) => c.table === "goal_student_state");
    expect(call?.orders).toEqual([
      ["onboarded_at", false, true],
      ["profile_id", true, undefined],
    ]);
  });

  test("페이지는 10건 단위 range 로 읽는다", async () => {
    kit.db.tables.goal_student_state = Array.from({ length: 25 }, (_, i) =>
      stateRow(`s${String(i).padStart(2, "0")}`),
    );
    const r = await get({ page: "3" });
    const body = r.body as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(5);
    expect(body.total).toBe(25);
    const call = kit.db.calls.find((c) => c.table === "goal_student_state");
    expect(call?.range).toEqual([20, 29]);
  });

  test.each([
    ["awaiting_cuts", ["status", "eq", "awaiting_cuts"]],
    ["paused", ["status", "eq", "paused"]],
    ["noRecord", ["record_count", "eq", 0]],
  ])("filter=%s 는 서버 술어로 나간다", async (filter, expected) => {
    await get({ filter });
    const call = kit.db.calls.find((c) => c.table === "goal_student_state");
    expect(call?.filters).toContainEqual(expected);
  });

  test("noSubmitToday 는 보는 사람 시간대의 오늘보다 이전인 last_record_date 만 건다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T16:00:00Z"));
    kit.db.tables.goal_student_state = [
      stateRow("old", { last_record_date: "2026-11-24" }),
      stateRow("new", { last_record_date: "2026-11-25" }),
      stateRow("none", { last_record_date: null }),
    ];
    const seoul = await get({ filter: "noSubmitToday" }, "Asia/Seoul");
    expect(
      (seoul.body as { items: { profile_id: string }[] }).items.map(
        (i) => i.profile_id,
      ),
    ).toEqual(["old"]);
    const la = await get({ filter: "noSubmitToday" }, "America/Los_Angeles");
    expect((la.body as { total: number }).total).toBe(0);
  });

  test("noSubmitToday 는 시간대 헤더가 없으면 400", async () => {
    const r = await get({ filter: "noSubmitToday" }, null);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "TIME_ZONE_REQUIRED" });
  });

  test("알 수 없는 filter 나 잘못된 page 는 400", async () => {
    expect((await get({ filter: "zzz" })).status).toBe(400);
    expect((await get({ page: "0" })).status).toBe(400);
  });

  test("검색은 이름이나 연락처로 profiles 를 먼저 좁혀 id 로 거른다", async () => {
    kit.db.tables.profiles = [
      { id: "s1", name: "김학생", phone: "01011112222" },
      { id: "s2", name: "이학생", phone: "01033334444" },
    ];
    kit.db.tables.goal_student_state = [stateRow("s1"), stateRow("s2")];
    const r = await get({ q: " 김학 " });
    const body = r.body as { items: { profile_id: string }[]; total: number };
    expect(body.items.map((i) => i.profile_id)).toEqual(["s1"]);
    expect(body.total).toBe(1);
    const search = kit.db.calls.find((c) => c.or);
    expect(search?.or).toBe("name.ilike.%김학%,phone.ilike.%김학%");
    expect(search?.limit).toBe(500);
  });

  test("검색어의 PostgREST 구문 문자는 공백으로 바꾸고 비면 빈 목록이다", async () => {
    const r = await get({ q: "(,)%_" });
    expect(r.body).toEqual({ items: [], total: 0, searchTruncated: false });
    expect(kit.db.calls.some((c) => c.or)).toBe(false);
  });

  test("검색 결과가 없으면 학생 조회 없이 빈 목록", async () => {
    kit.db.tables.goal_student_state = [stateRow("s1")];
    const r = await get({ q: "없는이름" });
    expect(r.body).toEqual({ items: [], total: 0, searchTruncated: false });
    expect(kit.db.calls.some((c) => c.table === "goal_student_state")).toBe(
      false,
    );
  });

  test("검색 선행 조회가 500건에 닿으면 searchTruncated", async () => {
    kit.db.tables.profiles = Array.from({ length: 500 }, (_, i) => ({
      id: `p${i}`,
      name: "김",
      phone: "0",
    }));
    const r = await get({ q: "김" });
    expect((r.body as { searchTruncated: boolean }).searchTruncated).toBe(true);
  });
});
