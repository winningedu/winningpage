// GET /api/goal/admin/students/:id 계약 검증. 학생 한 명의 goal_students, goal_student_state, profiles,
// goal_probability_logs 와 슬롯별 현재 컷을 돌려준다. 읽기 전용(구 RLS 에 쓰기 정책 없음).

import { beforeEach, describe, expect, test, vi } from "vitest";
import { goalStudentDetailResponse } from "../../../../shared/goal/admin-students.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  createGoalAdmin,
  createGoalDb,
  type GoalDb,
} from "../../../_lib/goal/adminStudentsTestKit.js";
import { callHandler } from "../../../_lib/tenantRoute.testkit.js";

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

const one = (id: string) => ({
  app,
  path: `/api/goal/admin/students/${id}`,
});

const ID = "11111111-1111-4111-8111-111111111111";
const get = (id: string = ID) => callHandler(one(id), undefined, "GET");

const student = {
  profile_id: ID,
  school_type: "일반고",
  ideal_university: " 서울대 ",
  ideal_department: "경영",
  min_university: "한양대",
  min_department: "",
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createGoalDb({
    goal_students: [student],
    goal_student_state: [{ profile_id: ID, status: "active" }],
    profiles: [{ id: ID, name: "김학생", phone: "010", email: "a@b.c" }],
    goal_probability_logs: [
      { id: 2, profile_id: ID, created_at: "2026-11-02" },
      { id: 1, profile_id: ID, created_at: "2026-11-01" },
      { id: 3, profile_id: "other", created_at: "2026-11-03" },
    ],
    goal_university_cuts: [
      {
        id: 9,
        cut_type: "normal",
        university_name: "서울대",
        department_name: "경영",
        is_active: true,
        avg_cut: 1.5,
        source: "s",
        source_year: 2026,
        updated_at: "t",
        extra: "x",
      },
      {
        id: 8,
        cut_type: "normal",
        university_name: "서울대",
        department_name: "경영",
        is_active: false,
        avg_cut: 9,
      },
    ],
  });
  seedAdmin(kit.state, "view", "goalStudents");
});

describe("GET /api/goal/admin/students/:id", () => {
  test("학생, 상태, 프로필, 로그(오름차순)를 돌려준다", async () => {
    const r = await get();
    expect(() => goalStudentDetailResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.student).toEqual(student);
    expect(body.state).toEqual({ profile_id: ID, status: "active" });
    expect(body.profile).toEqual({
      id: ID,
      name: "김학생",
      phone: "010",
      email: "a@b.c",
    });
    expect((body.logs as { id: number }[]).map((log) => log.id)).toEqual([
      1, 2,
    ]);
  });

  test("슬롯별 컷은 활성 행만, 지정한 4개 컬럼만 돌려주고 비면 null", async () => {
    const r = await get();
    const { cuts } = r.body as { cuts: Record<string, unknown> };
    expect(cuts.idealNaesin).toEqual({
      avg_cut: 1.5,
      source: "s",
      source_year: 2026,
      updated_at: "t",
    });
    // 정시 컷 행이 없고, 하한 학과가 비어 있으면 조회하지 않고 null
    expect(cuts.idealJungsi).toBeNull();
    expect(cuts.minNaesin).toBeNull();
    expect(cuts.minJungsi).toBeNull();
  });

  test("컷 조회 술어는 cut_type, 대학, 학과, is_active, id 정렬, limit 1 이다", async () => {
    await get();
    const call = kit.db.calls.find(
      (c) =>
        c.table === "goal_university_cuts" &&
        c.filters.some(([col, , v]) => col === "cut_type" && v === "normal"),
    );
    expect(call?.filters).toEqual([
      ["cut_type", "eq", "normal"],
      ["university_name", "eq", "서울대"],
      ["department_name", "eq", "경영"],
      ["is_active", "eq", true],
    ]);
    expect(call?.orders).toEqual([["id", true, undefined]]);
    expect(call?.limit).toBe(1);
    expect(call?.columns).toBe("avg_cut, source, source_year, updated_at");
  });

  test("goal_students 행이 없으면 404 NOT_FOUND", async () => {
    kit.db.tables.goal_students = [];
    const r = await get();
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("uuid 가 아닌 id 는 400", async () => {
    expect((await get("not-a-uuid")).status).toBe(400);
  });

  test("권한 없으면 403, 읽기 전용이라 쓰기 호출이 없다", async () => {
    expect((await get()).status).toBe(200);
    expect(kit.db.calls.filter((c) => c.op === "write")).toEqual([]);
    seedAdmin(kit.state, "none", "goalStudents");
    expect((await get()).status).toBe(403);
  });

  test("GET 외 메서드는 405", async () => {
    const r = await callHandler(one(ID), {}, "POST");
    expect(r.status).toBe(405);
  });
});
