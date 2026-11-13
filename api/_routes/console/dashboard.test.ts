// GET /api/console/dashboard 계약 검증(W5). 범위 안 학생의 서비스 이용, 목표시간 달성율 3단계, 서비스별 인원.
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 기관 전체를 집계한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./dashboard.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const CLASSES = [
  {
    id: "c-3",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "3",
  },
  {
    id: "c-5",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "5",
  },
  {
    id: "c-1",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고1",
    group_id: "g-1",
    name: "1",
  },
  {
    id: "c-old",
    tenant_id: "tenant-1",
    school_year: 2025,
    grade: "고1",
    group_id: null,
    name: "2",
  },
  {
    id: "c-x",
    tenant_id: "tenant-2",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "9",
  },
];

// 학생의 학년은 학급의 학년과 같다(학급이 없으면 없다).
const GRADE_OF_CLASS: Record<string, string> = {
  "c-3": "고2",
  "c-5": "고2",
  "c-1": "고1",
  "c-x": "고2",
};

const enroll = (student_id: string, class_id: string | null, over = {}) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  student_id,
  class_id,
  grade: class_id ? (GRADE_OF_CLASS[class_id] ?? null) : null,
  ...over,
});

const ENROLLMENTS = [
  enroll("s1", "c-3"),
  enroll("s2", "c-3"),
  enroll("s8", "c-3"),
  enroll("s3", "c-5"),
  enroll("s4", "c-1"),
  enroll("s5", "c-x", { tenant_id: "tenant-2" }),
  enroll("s6", "c-3", { status: "graduated" }),
  enroll("s7", null),
];

const daily = (
  profile_id: string,
  record_date: string,
  study_hours: number,
  target_ideal_hours: number,
) => ({
  profile_id,
  record_date,
  study_hours,
  target_ideal_hours,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T03:00:00Z"));
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
  const use = (ids: string[]) => (f: Record<string, unknown>) =>
    matchRows(
      ids.map((profile_id) => ({ profile_id })),
      f,
    );
  kit.state.rows.diagnosis_attempts = use(["s1", "s2", "s3", "s7"]);
  kit.state.rows.goal_students = use(["s1", "s2", "s4"]);
  kit.state.rows.growth_profiles = use(["s1"]);
  kit.state.rows.growth_reports = use([]);
  kit.state.rows.performance_sessions = use([]);
  kit.state.rows.selfeval_sessions = use([]);
  kit.state.rows.inquiry_sessions = use([]);
  kit.state.rows.goal_daily_records = (f) =>
    matchRows(
      [
        daily("s1", "2026-11-02", 5, 5),
        daily("s1", "2026-11-03", 1, 5),
        daily("s4", "2026-11-03", 6, 5),
        daily("s1", "2026-10-28", 0, 5),
      ],
      f,
    );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/console/dashboard", () => {
  test("school admin gets whole-tenant counts for this school year: usage, goal achievement buckets, per-service students", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      asOf: "2026-11-04",
      usage: { usingCount: 4, totalCount: 5 },
      // s2 는 목표 설정일이 없어 달성율이 없으므로 평균과 구간에서 빠진다(결정 62). 이용자 수에는 든다.
      goal: { userCount: 3, average: 80, buckets: { low: 0, mid: 1, high: 1 } },
      services: [
        { key: "diagnosis", count: 3 },
        { key: "goal", count: 3 },
        { key: "growth", count: 1 },
        { key: "performance", count: 0 },
        { key: "selfeval", count: 0 },
        { key: "inquiry", count: 0 },
      ],
    });
  });
  test("weekly goal rate uses the 7 days ending yesterday (KST), not Monday to today", async () => {
    // 오늘 11-04 의 오늘 기록은 빼고, 10-28 ~ 11-03 만 센다.
    kit.state.rows.goal_daily_records = (f) =>
      matchRows(
        [
          daily("s1", "2026-11-04", 100, 5),
          daily("s1", "2026-10-28", 5, 5),
          daily("s1", "2026-10-27", 100, 5),
        ],
        f,
      );
    const r = await get({ classId: "c-3" });
    // s1 5/5 = 100, s2 는 목표 설정일이 없어 평균과 구간에서 빠진다. 목표관리 학생은 s1, s2
    expect((r.body as { goal: unknown }).goal).toEqual({
      userCount: 2,
      average: 100,
      buckets: { low: 0, mid: 0, high: 1 },
    });
  });

  test("a homeroom is counted over the classes assigned to them only", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-3"],
    });
    const r = await get();

    expect(r.status).toBe(200);
    expect((r.body as { usage: unknown }).usage).toEqual({
      usingCount: 2,
      totalCount: 3,
    });
  });

  test("a homeroom asking for a class they do not teach gets 404", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-3"],
    });
    const r = await get({ classId: "c-5" });

    expect(r.status).toBe(404);
  });

  test("classId, grade and groupId narrow the scope", async () => {
    const byClass = await get({ classId: "c-5" });
    expect((byClass.body as { usage: unknown }).usage).toEqual({
      usingCount: 1,
      totalCount: 1,
    });
    const byGrade = await get({ grade: "고1" });
    expect((byGrade.body as { usage: unknown }).usage).toEqual({
      usingCount: 1,
      totalCount: 1,
    });
    const byGroup = await get({ grade: "고1", groupId: "g-1" });
    expect((byGroup.body as { usage: unknown }).usage).toEqual({
      usingCount: 1,
      totalCount: 1,
    });
    const noMatch = await get({ grade: "고2", groupId: "g-1" });
    expect((noMatch.body as { usage: unknown }).usage).toEqual({
      usingCount: 0,
      totalCount: 0,
    });
  });

  test("a scope with no goal students has a null average and zero buckets", async () => {
    const r = await get({ classId: "c-5" });
    expect((r.body as { goal: unknown }).goal).toEqual({
      userCount: 0,
      average: null,
      buckets: { low: 0, mid: 0, high: 0 },
    });
  });

  test("grade=mixed narrows to grade-less classes, counts every student in them whatever their grade, and a homeroom stays in own classes", async () => {
    const mixed = {
      id: "c-mix",
      tenant_id: "tenant-1",
      school_year: 2026,
      grade: null,
      group_id: null,
      name: "다",
    };
    kit.state.rows.classes = (f) => matchRows([...CLASSES, mixed], f);
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        [
          ...ENROLLMENTS,
          enroll("s9", "c-mix", { grade: "중2" }),
          enroll("s10", "c-mix", { grade: "고1" }),
        ],
        f,
      );

    const byMixed = await get({ grade: "mixed" });
    expect((byMixed.body as { usage: unknown }).usage).toEqual({
      usingCount: 0,
      totalCount: 2,
    });
    // 학년 필터는 학생의 학년이라 다학년 학급의 고1 학생(s10)도 센다.
    const byGrade = await get({ grade: "고1" });
    expect((byGrade.body as { usage: unknown }).usage).toEqual({
      usingCount: 1,
      totalCount: 2,
    });

    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-3"],
    });
    const outside = await get({ grade: "mixed" });
    expect((outside.body as { usage: unknown }).usage).toEqual({
      usingCount: 0,
      totalCount: 0,
    });
  });

  test("a real grade filter counts the students of that grade in every class, graded or mixed, so it agrees with the student list (10 + 5)", async () => {
    const mixed = {
      id: "c-mix",
      tenant_id: "tenant-1",
      school_year: 2026,
      grade: null,
      group_id: null,
      name: "다",
    };
    const graded = {
      id: "c-g2",
      tenant_id: "tenant-1",
      school_year: 2026,
      grade: "중2",
      group_id: null,
      name: "1",
    };
    kit.state.rows.classes = (f) => matchRows([...CLASSES, graded, mixed], f);
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        [
          ...Array.from({ length: 10 }, (_, i) =>
            enroll(`g${i}`, "c-g2", { grade: "중2" }),
          ),
          ...Array.from({ length: 5 }, (_, i) =>
            enroll(`m${i}`, "c-mix", { grade: "중2" }),
          ),
          enroll("m5", "c-mix", { grade: "고1" }),
        ],
        f,
      );

    const byGrade = await get({ grade: "중2" });
    expect((byGrade.body as { usage: unknown }).usage).toMatchObject({
      totalCount: 15,
    });
    const byMixed = await get({ grade: "mixed" });
    expect((byMixed.body as { usage: unknown }).usage).toMatchObject({
      totalCount: 6,
    });
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-mix"],
    });
    const own = await get({ grade: "중2" });
    expect((own.body as { usage: unknown }).usage).toMatchObject({
      totalCount: 5,
    });
  });

  test("an unknown grade is a 400", async () => {
    const r = await get({ grade: "고9" });
    expect(r.status).toBe(400);
  });
});
