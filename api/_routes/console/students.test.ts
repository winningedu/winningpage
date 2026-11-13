// GET /api/console/students 계약 검증(W6 학생 관리). 담임은 담당 학급의 실명, 관리자는 전교의 가린 이름.

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

import { weekWindows } from "../../_lib/console/goalRate.js";
import handler from "./students.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const row = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  grade: null,
  class_id: null,
  number: null,
  version: 1,
  ...over,
});

const ENROLLMENTS = [
  row({
    id: "e1",
    student_id: "s1",
    grade: "고2",
    class_id: "c-A",
    number: 7,
    version: 3,
  }),
  row({ id: "e2", student_id: "s2", grade: "고2", class_id: "c-A", number: 1 }),
  row({
    id: "e3",
    student_id: "s3",
    grade: "고1",
    class_id: "c-G",
    number: null,
  }),
  row({ id: "e4", student_id: "s4" }),
  row({
    id: "e5",
    student_id: "s5",
    grade: "고3",
    class_id: "c-A",
    status: "graduated",
  }),
  row({
    id: "e6",
    student_id: "s6",
    tenant_id: "tenant-2",
    grade: "고2",
    class_id: "c-X",
    number: 2,
  }),
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-A",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "3",
        },
        {
          id: "c-G",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고1",
          group_id: "g-1",
          name: "1",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김하늘", created_at: "2026-03-02T01:00:00Z" },
        { id: "s2", name: "윤하린", created_at: "2026-03-04T01:00:00Z" },
        { id: "s3", name: "박서준", created_at: "2026-03-04T01:00:00Z" },
        { id: "s4", name: "이도윤", created_at: "2026-03-05T16:00:00Z" },
      ],
      f,
    );
  // s1: 학습진단, 목표관리, 성장설계(프로필과 리포트 둘 다 있어도 한 번). s2: 심화탐구 하나.
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "s1" }], f);
  kit.state.rows.goal_students = (f) => matchRows([{ profile_id: "s1" }], f);
  kit.state.rows.growth_profiles = (f) => matchRows([{ profile_id: "s1" }], f);
  kit.state.rows.growth_reports = (f) =>
    matchRows([{ id: "g1", profile_id: "s1" }], f);
  kit.state.rows.performance_sessions = () => [];
  kit.state.rows.selfeval_sessions = () => [];
  kit.state.rows.inquiry_sessions = (f) =>
    matchRows([{ id: "i1", profile_id: "s2" }], f);
  kit.state.rows.diagnosis_reports = () => [];
  kit.state.rows.goal_daily_records = () => [];
  kit.state.rows.student_flags = () => [];
  kit.state.rows.roster_pending_students = () => [];
});

type Item = { studentId: string; displayName: string };
const items = (r: { body: unknown }) => (r.body as { items: Item[] }).items;
const ids = (r: { body: unknown }) => items(r).map((i) => i.studentId);

describe("GET /api/console/students", () => {
  test("school admin gets the tenant's current students by grade, class and number (no class last) with masked names and read-only rows", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["s3", "s2", "s1", "s4"]);
    expect(items(r).map((i) => i.displayName)).toEqual([
      "박*준",
      "윤*린",
      "김*늘",
      "이*윤",
    ]);
    expect(r.body).toMatchObject({
      total: 4,
      scopeTotal: 4,
      page: 1,
      pageSize: 50,
      orgType: "학원",
    });
    expect(items(r).some((i) => (i as { canEdit?: boolean }).canEdit)).toBe(
      false,
    );
  });

  test("a row carries the join date, the used services in order with their count, and the enrollment slot", async () => {
    const r = await get();
    const s1 = items(r).find((i) => i.studentId === "s1");
    const s3 = items(r).find((i) => i.studentId === "s3");

    expect(s1).toEqual({
      studentId: "s1",
      displayName: "김*늘",
      joinedAt: "2026-03-02",
      grade: "고2",
      groupId: null,
      groupName: null,
      classId: "c-A",
      className: "3",
      number: 7,
      services: {
        diagnosis: true,
        goal: true,
        growth: true,
        performance: false,
        selfeval: false,
        inquiry: false,
      },
      serviceCount: 3,
      urgency: null,
      weeklyGoalRate: null,
      weeklyGoalLevel: null,
      specialReasons: [],
      canEdit: false,
      enrollmentVersion: 3,
    });
    expect(s3).toMatchObject({
      groupId: "g-1",
      groupName: "A레벨",
      serviceCount: 0,
    });
    // 협정 세계시 16시는 한국 시각으로 다음 날이다.
    expect(items(r).find((i) => i.studentId === "s4")).toMatchObject({
      joinedAt: "2026-03-06",
    });
  });

  test("a homeroom sees only students of own classes, with real names, and can edit them", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    const r = await get();

    expect(ids(r)).toEqual(["s2", "s1"]);
    expect(items(r).map((i) => i.displayName)).toEqual(["윤하린", "김하늘"]);
    expect(
      items(r).every((i) => (i as { canEdit?: boolean }).canEdit === true),
    ).toBe(true);
  });

  test("grade, groupId, classId and q narrow the list while scopeTotal stays the unfiltered count", async () => {
    const byGrade = await get({ grade: "고1" });
    expect(ids(byGrade)).toEqual(["s3"]);
    expect(byGrade.body).toMatchObject({ total: 1, scopeTotal: 4 });
    expect(ids(await get({ groupId: "g-1" }))).toEqual(["s3"]);
    expect(ids(await get({ classId: "c-A" }))).toEqual(["s2", "s1"]);
    expect(ids(await get({ q: "윤하린" }))).toEqual(["s2"]);
  });

  test("a non-homeroom actor's q matches only the exact full name (decision 61), a homeroom keeps the partial match", async () => {
    expect(ids(await get({ q: "하린" }))).toEqual([]);
    expect(ids(await get({ q: "윤하" }))).toEqual([]);
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    expect(ids(await get({ q: "하린" }))).toEqual(["s2"]);
  });

  test("tab narrows to students who used that service, and none lists students with no service", async () => {
    expect(ids(await get({ tab: "growth" }))).toEqual(["s1"]);
    expect(ids(await get({ tab: "inquiry" }))).toEqual(["s2"]);
    expect(ids(await get({ tab: "none" }))).toEqual(["s3", "s4"]);
    expect(ids(await get({ tab: "all" }))).toHaveLength(4);
  });

  test("an unknown tab is a 400", async () => {
    expect((await get({ tab: "nope" })).status).toBe(400);
  });

  test("a homeroom asking for another teacher's class gets 404", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    expect((await get({ classId: "c-G" })).status).toBe(404);
  });

  test("pageSize and page slice the list", async () => {
    const r = await get({ pageSize: "3", page: "2" });
    expect(ids(r)).toEqual(["s4"]);
    expect(r.body).toMatchObject({
      total: 4,
      page: 2,
      pageSize: 3,
      pageCount: 2,
    });
  });

  describe("미회원가입 (roster_pending_students)", () => {
    const pendingRow = (over: Record<string, unknown>) => ({
      tenant_id: "tenant-1",
      school_year: 2026,
      grade: "고2",
      class_id: "c-A",
      number: null,
      ...over,
    });

    beforeEach(() => {
      kit.state.rows.roster_pending_students = (f) =>
        matchRows(
          [
            pendingRow({ id: "p1", name: "한가입", number: 4 }),
            // 같은 학급에 같은 이름의 재학생(s1)이 가입했다.
            pendingRow({ id: "p2", name: "김하늘" }),
            pendingRow({
              id: "p3",
              name: "최별도",
              grade: "고1",
              class_id: "c-G",
              number: 2,
            }),
            pendingRow({ id: "p4", name: "다른기관", tenant_id: "tenant-2" }),
            pendingRow({ id: "p5", name: "지난해", school_year: 2025 }),
          ],
          f,
        );
    });

    type Pending = Item & {
      pending?: boolean;
      canEdit: boolean;
      services: Record<string, boolean>;
    };
    const pendingItems = (r: { body: unknown }) =>
      (items(r) as Pending[]).filter((i) => i.pending);

    test("sit in the list by grade, class and number with the masked name and no actions, hidden once the student joined, and count in scopeTotal", async () => {
      const r = await get();

      expect(ids(r)).toEqual(["p3", "s3", "s2", "p1", "s1", "s4"]);
      expect(pendingItems(r).map((i) => i.displayName)).toEqual([
        "최*도",
        "한*입",
      ]);
      expect(pendingItems(r).every((i) => !i.canEdit)).toBe(true);
      expect((items(r) as Pending[]).filter((i) => !i.pending)).toHaveLength(4);
      expect(r.body).toMatchObject({ total: 6, scopeTotal: 6 });
    });

    test("follow the grade, class and q filters and the page slices", async () => {
      expect(ids(await get({ grade: "고1" }))).toEqual(["p3", "s3"]);
      expect(ids(await get({ classId: "c-A" }))).toEqual(["s2", "p1", "s1"]);
      expect(ids(await get({ groupId: "g-1" }))).toEqual(["p3", "s3"]);
      expect(ids(await get({ q: "한가입" }))).toEqual(["p1"]);
      expect(ids(await get({ pageSize: "2", page: "2" }))).toEqual([
        "s2",
        "p1",
      ]);
    });

    test("a homeroom sees only pending lines of own classes, with the real name", async () => {
      kit.state.actor = schoolAdminActor({
        kind: "homeroom",
        class_ids: ["c-A"],
      });
      const r = await get();

      expect(ids(r)).toEqual(["s2", "p1", "s1"]);
      expect(pendingItems(r).map((i) => i.displayName)).toEqual(["한가입"]);
    });

    test("are not services users: a service tab, none and special=1 leave them out", async () => {
      expect(ids(await get({ tab: "none" }))).toEqual(["s3", "s4"]);
      expect(ids(await get({ tab: "growth" }))).toEqual(["s1"]);
      expect(ids(await get({ special: "1" }))).not.toContain("p1");
      // 가입 전 줄은 전체 탭에서만 세므로 다른 탭과 특이학생에서는 scopeTotal 에 더하지 않는다.
      expect((await get({ tab: "growth" })).body).toMatchObject({
        scopeTotal: 4,
      });
      expect((await get({ special: "1" })).body).toMatchObject({
        scopeTotal: 4,
      });
    });
  });

  test("a malformed page is a 400", async () => {
    expect((await get({ page: "x" })).status).toBe(400);
  });

  test("urgency comes from the lowest of the 12 area scores in the latest stored report (under 45 very high, 60 high, 70 mid, else low)", async () => {
    const report = (
      attempt: string,
      profile: string,
      diagnosedAt: string,
      p1: number[],
      p2: number[],
    ) => ({
      attempt_id: attempt,
      profile_id: profile,
      diagnosed_at: diagnosedAt,
      payload: {
        learningAxes: p1.map((score) => ({ name: "영역", score })),
        readiness: { areas: p2.map((score) => ({ name: "영역", score })) },
      },
    });
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows(
        [
          // s1 의 옛 리포트는 매우 높음이었으나 최신(낮음)이 이긴다.
          report("a1", "s1", "2026-01-01T00:00:00Z", [30, 90], [80]),
          report("a2", "s1", "2026-06-01T00:00:00Z", [75, 90], [80]),
          report("a3", "s2", "2026-06-01T00:00:00Z", [90], [44, 99]),
          report("a4", "s3", "2026-06-01T00:00:00Z", [90], [59]),
          report("a5", "s4", "2026-06-01T00:00:00Z", [90], [69]),
        ],
        f,
      );

    const r = await get();
    const urgency = (id: string) =>
      (
        items(r).find((i) => i.studentId === id) as unknown as {
          urgency: string;
        }
      ).urgency;

    expect(urgency("s1")).toBe("low");
    expect(urgency("s2")).toBe("very_high");
    expect(urgency("s3")).toBe("high");
    expect(urgency("s4")).toBe("mid");
  });

  test("a student without a report has no urgency", async () => {
    const r = await get();
    expect(
      (items(r)[0] as unknown as { urgency: string | null }).urgency,
    ).toBeNull();
  });

  test("students of one class whose masked names match get a trailing star, a homeroom sees real names", async () => {
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "s1", name: "김하늘", created_at: null },
          { id: "s2", name: "김하늘", created_at: null },
          { id: "s3", name: "박서준", created_at: null },
          { id: "s4", name: "김하늘", created_at: null },
        ],
        f,
      );

    const admin = await get();
    const byId = (id: string) =>
      items(admin).find((i) => i.studentId === id)?.displayName;

    // s1 과 s2 는 같은 반(c-A), s4 는 반 없음이라 겹치지 않는다.
    expect(byId("s1")).toBe("김*늘*");
    expect(byId("s2")).toBe("김*늘*");
    expect(byId("s4")).toBe("김*늘");
    expect(byId("s3")).toBe("박*준");
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    expect(items(await get()).map((i) => i.displayName)).toEqual([
      "김하늘",
      "김하늘",
    ]);
  });

  test("weeklyGoalRate is the rounded rate over the 7 days before today for goal users, null for the others and for goal users with no target", async () => {
    const day = weekWindows().thisWeek.find(
      (d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0,
    );
    kit.state.rows.goal_daily_records = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            record_date: day,
            study_hours: 3,
            target_ideal_hours: 7,
            target_min_hours: 4,
          },
        ],
        f,
      );
    const read = (r: { body: unknown }, id: string) =>
      items(r).find((i) => i.studentId === id) as unknown as {
        weeklyGoalRate: number | null;
        weeklyGoalLevel: string | null;
      };

    const r = await get();

    expect(read(r, "s1")).toMatchObject({
      weeklyGoalRate: 43,
      weeklyGoalLevel: "mid",
    });
    expect(read(r, "s2")).toMatchObject({
      weeklyGoalRate: null,
      weeklyGoalLevel: null,
    });
  });

  test("a target day with no record counts as 0 hours using the student's plan", async () => {
    kit.state.rows.goal_students = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            study_schedule: {
              monday: { ideal: 5, min: 3 },
              tuesday: { ideal: 5, min: 3 },
              wednesday: { ideal: 5, min: 3 },
              thursday: { ideal: 5, min: 3 },
              friday: { ideal: 5, min: 3 },
              saturday: { ideal: 5, min: 3 },
            },
          },
        ],
        f,
      );

    const r = await get();

    expect(items(r).find((i) => i.studentId === "s1")).toMatchObject({
      weeklyGoalRate: 0,
      weeklyGoalLevel: "low",
    });
  });
});

describe("GET /api/console/students mixed-grade class", () => {
  // c-M 은 학년이 없는 다학년 학급. s7 은 중2, s8 은 고1 이고, 가입 전 줄 하나는 학년이 없다.
  beforeEach(() => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        [
          ...ENROLLMENTS,
          row({
            id: "e7",
            student_id: "s7",
            grade: "중2",
            class_id: "c-M",
            number: 1,
          }),
          row({
            id: "e8",
            student_id: "s8",
            grade: "고1",
            class_id: "c-M",
            number: 2,
          }),
        ],
        f,
      );
    const baseClasses = kit.state.rows.classes;
    kit.state.rows.classes = (f) => [
      ...(baseClasses ? (baseClasses(f) as unknown[]) : []),
      ...matchRows(
        [
          {
            id: "c-M",
            tenant_id: "tenant-1",
            school_year: 2026,
            grade: null,
            group_id: null,
            name: "다",
          },
        ],
        f,
      ),
    ];
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "s1", name: "김하늘", created_at: "2026-03-02T01:00:00Z" },
          { id: "s2", name: "윤하린", created_at: "2026-03-04T01:00:00Z" },
          { id: "s3", name: "박서준", created_at: "2026-03-04T01:00:00Z" },
          { id: "s4", name: "이도윤", created_at: "2026-03-05T16:00:00Z" },
          { id: "s7", name: "최민준", created_at: "2026-03-06T01:00:00Z" },
          { id: "s8", name: "정서아", created_at: "2026-03-06T01:00:00Z" },
        ],
        f,
      );
    kit.state.rows.roster_pending_students = (f) =>
      matchRows(
        [
          {
            id: "p1",
            tenant_id: "tenant-1",
            school_year: 2026,
            name: "한가을",
            grade: null,
            class_id: "c-M",
            number: 3,
          },
        ],
        f,
      );
  });

  test("a homeroom of a mixed class sees all its students whatever their grade and nothing else", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-M"],
    });

    const r = await get();

    expect(ids(r)).toEqual(["s7", "s8", "p1"]);
    expect(items(r).map((i) => i.displayName)).toEqual([
      "최민준",
      "정서아",
      "한가을",
    ]);
  });

  test("a pending row of a mixed class carries a null grade", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-M"],
    });

    const r = await get();

    expect(items(r).find((i) => i.studentId === "p1")).toMatchObject({
      pending: true,
      grade: null,
      classId: "c-M",
    });
  });

  test("grade=mixed lists the students and pending rows of grade-less classes only", async () => {
    const r = await get({ grade: "mixed" });

    expect(ids(r)).toEqual(["s7", "s8", "p1"]);
  });

  test("a real grade filter still compares the student's own grade, in mixed classes too", async () => {
    expect(ids(await get({ grade: "고1" }))).toEqual(["s8", "s3"]);
    expect(ids(await get({ grade: "중2" }))).toEqual(["s7"]);
  });

  test("grade=mixed does not widen a homeroom's scope", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    expect(ids(await get({ grade: "mixed" }))).toEqual([]);
  });

  test("a homeroom asking for another teacher's mixed class gets 404", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    expect((await get({ classId: "c-M" })).status).toBe(404);
  });
});

describe("GET /api/console/students special students", () => {
  const report = (profile: string, score: number) => ({
    attempt_id: `a-${profile}`,
    profile_id: profile,
    diagnosed_at: "2026-06-01T00:00:00Z",
    payload: { learningAxes: [{ name: "영역", score }] },
  });
  type Special = { studentId: string; specialReasons: string[] };
  const special = (r: { body: unknown }) =>
    (r.body as { items: Special[] }).items;

  beforeEach(() => {
    // s1 긴급도 높음, s2 수동 지정, s3 달성율 기준 미만(목표 사용자)
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows([report("s1", 50), report("s2", 90)], f);
    kit.state.rows.student_flags = (f) =>
      matchRows([{ student_id: "s2", tenant_id: "tenant-1" }], f);
  });

  test("each row lists its special reasons: manual flag and urgency high or above", async () => {
    const r = await get();
    const byId = (id: string) =>
      special(r).find((i) => i.studentId === id)?.specialReasons;

    expect(byId("s1")).toEqual(["urgency"]);
    expect(byId("s2")).toEqual(["manual"]);
    expect(byId("s3")).toEqual([]);
  });

  test("special=1 keeps only students with a reason and total counts them", async () => {
    const r = await get({ special: "1" });

    expect(
      special(r)
        .map((i) => i.studentId)
        .sort(),
    ).toEqual(["s1", "s2"]);
    expect(r.body).toMatchObject({ total: 2, scopeTotal: 4 });
  });

  test("a raw weekly rate of 39.6 rounds to 40 and does not fire the low rate reason", async () => {
    const day = weekWindows().thisWeek.find(
      (d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0,
    );
    kit.state.rows.goal_daily_records = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            record_date: day,
            study_hours: 3.96,
            target_ideal_hours: 10,
            target_min_hours: 5,
          },
        ],
        f,
      );

    const r = await get();
    const s1 = (
      r.body as {
        items: {
          studentId: string;
          weeklyGoalRate: number;
          specialReasons: string[];
        }[];
      }
    ).items.find((i) => i.studentId === "s1");

    expect(s1?.weeklyGoalRate).toBe(40);
    expect(s1?.specialReasons).toEqual(["urgency"]);
  });

  test("special=1 takes the union of all five reasons, total counts the union and pages split it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T03:00:00Z"));
    try {
      // s1 low_rate + urgency, s2 manual, s3 feedback_wait, s4 inactive, s7 no reason
      kit.state.rows.student_enrollments = (f) =>
        matchRows(
          [
            ...ENROLLMENTS,
            row({
              id: "e7",
              student_id: "s7",
              grade: "고1",
              class_id: "c-G",
              number: 2,
            }),
          ],
          f,
        );
      kit.state.rows.profiles = (f) =>
        matchRows(
          [
            ...["s1", "s2", "s3", "s7"].map((id) => ({
              id,
              name: `학생${id}`,
              created_at: "2026-03-02T01:00:00Z",
              last_seen_at: null,
            })),
            {
              id: "s4",
              name: "학생s4",
              created_at: "2026-03-02T01:00:00Z",
              last_seen_at: "2026-10-01T00:00:00Z",
            },
          ],
          f,
        );
      const day = weekWindows().thisWeek.find(
        (d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0,
      );
      kit.state.rows.goal_daily_records = (f) =>
        matchRows(
          [
            {
              profile_id: "s1",
              record_date: day,
              study_hours: 1,
              target_ideal_hours: 10,
              target_min_hours: 5,
            },
          ],
          f,
        );
      kit.state.rows.performance_sessions = (f) =>
        matchRows(
          [
            {
              id: "ps-s3",
              profile_id: "s3",
              current_step: 5,
              updated_at: "2026-11-01T00:00:00Z",
            },
          ],
          f,
        );
      kit.state.rows.performance_submissions = (f) =>
        matchRows(
          [{ session_id: "ps-s3", submitted_at: "2026-10-26T00:00:00Z" }],
          f,
        );
      kit.state.rows.performance_reports = () => [];

      const first = await get({ special: "1", pageSize: "3", page: "1" });
      const second = await get({ special: "1", pageSize: "3", page: "2" });

      expect(special(first).map((i) => i.studentId)).toEqual([
        "s3",
        "s2",
        "s1",
      ]);
      expect(special(second).map((i) => i.studentId)).toEqual(["s4"]);
      expect(first.body).toMatchObject({
        total: 4,
        scopeTotal: 5,
        pageCount: 2,
      });
      expect(second.body).toMatchObject({ total: 4, page: 2 });
      const all = [...special(first), ...special(second)];
      expect(all.flatMap((i) => i.specialReasons).sort()).toEqual([
        "feedback_wait",
        "inactive",
        "low_rate",
        "manual",
        "urgency",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the low rate reason uses the default 40 percent when the tenant sets none, the tenant value when set, and the response carries all three thresholds", async () => {
    const day = weekWindows().thisWeek.find(
      (d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0,
    );
    kit.state.rows.goal_daily_records = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            record_date: day,
            study_hours: 1,
            target_ideal_hours: 10,
            target_min_hours: 5,
          },
        ],
        f,
      );

    const without = await get();
    expect(
      special(without).find((i) => i.studentId === "s1")?.specialReasons,
    ).toEqual(["low_rate", "urgency"]);
    expect(without.body).toMatchObject({
      specialExecRatePct: 40,
      specialInactiveDays: 7,
      specialFeedbackWaitDays: 14,
    });

    kit.state.rows.tenants = () => ({
      school_year: 2026,
      org_type: "학원",
      special_exec_rate_pct: 1,
      special_inactive_days: 3,
      special_feedback_wait_days: 5,
    });
    const withThreshold = await get();
    expect(withThreshold.body).toMatchObject({
      specialExecRatePct: 1,
      specialInactiveDays: 3,
      specialFeedbackWaitDays: 5,
    });
    expect(
      special(withThreshold).find((i) => i.studentId === "s1")?.specialReasons,
    ).toEqual(["urgency"]);
  });

  describe("inactive", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-09T03:00:00Z"));
      kit.state.rows.diagnosis_reports = () => [];
      kit.state.rows.student_flags = () => [];
    });
    afterEach(() => vi.useRealTimers());

    const seen = (lastSeen: Record<string, string | null>) => {
      kit.state.rows.profiles = (f) =>
        matchRows(
          ["s1", "s2", "s3", "s4"].map((id) => ({
            id,
            name: `학생${id}`,
            created_at: null,
            last_seen_at: lastSeen[id] ?? null,
          })),
          f,
        );
    };
    const reasonsById = (r: { body: unknown }) =>
      Object.fromEntries(
        special(r).map((i) => [i.studentId, i.specialReasons]),
      );

    test("7 KST calendar days or more since the last access is inactive, 6 and no record are not, and special=1 lists the inactive student", async () => {
      seen({
        // KST 11-02 23:59 is 7 days before 11-09, KST 11-03 00:00 is 6.
        s1: "2026-11-02T14:59:59Z",
        s2: "2026-11-02T15:00:00Z",
        s3: null,
      });

      expect(reasonsById(await get())).toEqual({
        s1: ["inactive"],
        s2: [],
        s3: [],
        s4: [],
      });
      const only = await get({ special: "1" });
      expect(special(only).map((i) => i.studentId)).toEqual(["s1"]);
      expect(only.body).toMatchObject({ total: 1 });
    });

    test("the tenant's inactive days replace the default 7", async () => {
      kit.state.rows.tenants = () => ({
        school_year: 2026,
        org_type: "학원",
        special_inactive_days: 3,
      });
      seen({ s1: "2026-11-06T03:00:00Z", s2: "2026-11-07T03:00:00Z" });

      expect(reasonsById(await get())).toMatchObject({
        s1: ["inactive"],
        s2: [],
      });
    });
  });

  describe("feedback wait", () => {
    const submitted = (daysAgo: number) =>
      // 협정 세계시 03시 기준 오늘(KST 11-09 12시)에서 daysAgo 일 전 정오(KST).
      new Date(Date.UTC(2026, 10, 9 - daysAgo, 3)).toISOString();
    let sessionCalls: unknown[];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-09T03:00:00Z"));
      kit.state.rows.diagnosis_reports = () => [];
      kit.state.rows.student_flags = () => [];
      sessionCalls = [];
      // s1 는 성공 제출 없음, s2 는 13일 전, s3 는 14일 전, s4 는 20일 전이지만 평가 리포트가 있다.
      const sessions = ["s1", "s2", "s3", "s4"].map((p) => ({
        id: `ps-${p}`,
        profile_id: p,
        current_step: 5,
        updated_at: "2026-11-01T00:00:00Z",
      }));
      kit.state.rows.performance_sessions = (f) => {
        sessionCalls.push(f.profile_id);
        return matchRows(sessions, f);
      };
      kit.state.rows.performance_submissions = (f) =>
        matchRows(
          [
            { session_id: "ps-s2", submitted_at: submitted(13) },
            { session_id: "ps-s3", submitted_at: submitted(14) },
            { session_id: "ps-s4", submitted_at: submitted(20) },
          ],
          f,
        );
      kit.state.rows.performance_reports = (f) =>
        matchRows([{ session_id: "ps-s4", report_type: "evaluation" }], f);
    });
    afterEach(() => vi.useRealTimers());

    const reasonsById = (r: { body: unknown }) =>
      Object.fromEntries(
        special(r).map((i) => [i.studentId, i.specialReasons]),
      );

    test("a latest submission waiting 14 days or more is feedback_wait, 13 days, an evaluated one and no submission are not, and special=1 lists it", async () => {
      expect(reasonsById(await get())).toMatchObject({
        s1: [],
        s2: [],
        s3: ["feedback_wait"],
        s4: [],
      });
      const only = await get({ special: "1" });
      expect(special(only).map((i) => i.studentId)).toEqual(["s3"]);
      expect(only.body).toMatchObject({ total: 1 });
    });

    test("the tenant's feedback wait days replace the default 14", async () => {
      kit.state.rows.tenants = () => ({
        school_year: 2026,
        org_type: "학원",
        special_feedback_wait_days: 13,
      });

      expect(reasonsById(await get())).toMatchObject({
        s2: ["feedback_wait"],
        s3: ["feedback_wait"],
      });
    });

    test("performance status is read only for students who used the performance service", async () => {
      kit.state.rows.performance_sessions = (f) => {
        sessionCalls.push(f.profile_id);
        return matchRows(
          [
            {
              id: "ps-s3",
              profile_id: "s3",
              current_step: 5,
              updated_at: "2026-11-01T00:00:00Z",
            },
          ],
          f,
        );
      };

      await get();

      const narrowed = sessionCalls.filter(
        (c) => Array.isArray(c) && c.length < 4,
      );
      expect(narrowed.length).toBeGreaterThan(0);
      expect(narrowed.every((c) => (c as string[]).join() === "s3")).toBe(true);
    });
  });

  test("the special filter combines with a service tab", async () => {
    expect(
      special(await get({ special: "1", tab: "growth" })).map(
        (i) => i.studentId,
      ),
    ).toEqual(["s1"]);
  });
});
