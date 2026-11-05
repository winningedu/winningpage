// GET /api/console/service-status 계약 검증(W8 서비스별 현황표). 고른 서비스를 쓰는 학생만, 담임은 담당 학급의 실명, 관리자는 전교의 가린 이름.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./service-status.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", { service: "diagnosis", ...query });

const enrollment = (student: string, classId: string, number: number) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  student_id: student,
  grade: "고2",
  class_id: classId,
  number,
});

const axes = (scores: number[]) =>
  scores.map((score, i) => ({
    name: `축${i + 1}`,
    score,
    status: score >= 70 ? "높음" : "보통",
  }));

const report = (
  student: string,
  attempt: string,
  diagnosedAt: string,
  page1: number[],
  page2: number[],
) => ({
  attempt_id: attempt,
  profile_id: student,
  diagnosed_at: diagnosedAt,
  payload: {
    learningAxes: axes(page1),
    readiness: { areas: axes(page2) },
  },
});

const EMPTY_TABLES = [
  "goal_students",
  "goal_student_state",
  "goal_daily_records",
  "growth_profiles",
  "growth_reports",
  "performance_sessions",
  "performance_submissions",
  "performance_reports",
  "selfeval_sessions",
  "inquiry_sessions",
  "inquiry_topics",
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({ kind: "homeroom", class_ids: ["c-A"] });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
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
          id: "c-B",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "4",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = () => [];
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment("s2", "c-A", 2),
        enrollment("s1", "c-A", 1),
        enrollment("s3", "c-A", 3),
        enrollment("s4", "c-B", 1),
      ],
      f,
    );
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김서연" },
        { id: "s2", name: "최민준" },
        { id: "s3", name: "마리아" },
        { id: "s4", name: "강호준" },
      ],
      f,
    );
  for (const table of EMPTY_TABLES) kit.state.rows[table] = () => [];
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows(
      [
        { id: "a1", profile_id: "s1" },
        { id: "a2", profile_id: "s2" },
        { id: "a4", profile_id: "s4" },
      ],
      f,
    );
  kit.state.rows.diagnosis_reports = (f) =>
    matchRows(
      [
        report(
          "s1",
          "a1",
          "2026-03-10T05:00:00Z",
          [60, 70, 80, 75, 65, 90],
          [71, 72, 70, 75, 80, 69],
        ),
        report(
          "s2",
          "a2",
          "2026-03-11T05:00:00Z",
          [40, 70, 80, 75, 65, 90],
          [71, 72, 70, 75, 80, 69],
        ),
        report(
          "s4",
          "a4",
          "2026-03-12T05:00:00Z",
          [90, 90, 90, 90, 90, 90],
          [90, 90, 90, 90, 90, 90],
        ),
      ],
      f,
    );
});

afterEach(() => vi.useRealTimers());

describe("GET /api/console/service-status (diagnosis)", () => {
  test("homeroom sees only own class students who use the service, real names, by number, with the diagnosis summary", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    const body = res.body as {
      total: number;
      items: Record<string, unknown>[];
    };
    expect(body.total).toBe(2);
    expect(body.items).toEqual([
      {
        studentId: "s1",
        name: "김서연",
        grade: "고2",
        groupName: null,
        className: "3",
        number: 1,
        detail: {
          urgency: "mid",
          executionAvg: 73,
          readinessAvg: 73,
          weakest: { name: "축1", score: 60, status: "보통" },
          diagnosedAt: "2026-03-10",
        },
      },
      expect.objectContaining({
        studentId: "s2",
        name: "최민준",
        number: 2,
        detail: expect.objectContaining({ urgency: "very_high" }),
      }),
    ]);
  });

  test("school admin sees the whole tenant with masked names", async () => {
    kit.state.actor = schoolAdminActor();

    const res = await get();

    const items = (res.body as { items: { name: string; className: string }[] })
      .items;
    expect(items.map((i) => [i.name, i.className])).toEqual([
      ["김*연", "3"],
      ["최*준", "3"],
      ["강*준", "4"],
    ]);
  });

  test("same masked names in one class get a trailing star, another class does not", async () => {
    kit.state.actor = schoolAdminActor();
    const baseProfiles = kit.state.rows.profiles;
    const renamed: Record<string, string> = {
      s2: "김하연",
      s4: "김가연",
    };
    kit.state.rows.profiles = (f) =>
      ((baseProfiles?.(f) ?? []) as { id: string; name: string }[]).map(
        (p) => ({
          ...p,
          name: renamed[p.id] ?? p.name,
        }),
      );

    const res = await get();

    const items = (res.body as { items: { name: string; className: string }[] })
      .items;
    expect(items.map((i) => [i.name, i.className])).toEqual([
      ["김*연*", "3"],
      ["김*연*", "3"],
      ["김*연", "4"],
    ]);
  });

  test("classId and q narrow the list; q matches the real name", async () => {
    kit.state.actor = schoolAdminActor();

    const byClass = await get({ classId: "c-B" });
    const byName = await get({ q: "김서연" });

    expect((byClass.body as { total: number }).total).toBe(1);
    expect(
      (byName.body as { items: { studentId: string }[] }).items.map(
        (i) => i.studentId,
      ),
    ).toEqual(["s1"]);
  });

  test("a non-homeroom actor's q matches only the exact full name (decision 61), a homeroom keeps the partial match", async () => {
    const total = async () =>
      ((await get({ q: "서연" })).body as { total: number }).total;

    kit.state.actor = schoolAdminActor();
    expect(await total()).toBe(0);
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    expect(await total()).toBe(1);
  });

  test("pages the list and reports the page count", async () => {
    kit.state.actor = schoolAdminActor();

    const res = await get({ page: "2", pageSize: "2" });

    const body = res.body as {
      total: number;
      page: number;
      pageCount: number;
      items: { studentId: string }[];
    };
    expect(body).toMatchObject({ total: 3, page: 2, pageCount: 2 });
    expect(body.items.map((i) => i.studentId)).toEqual(["s4"]);
  });

  test("an unknown service or a bad page is 400", async () => {
    expect((await get({ service: "nope" })).status).toBe(400);
    expect((await get({ page: "0" })).status).toBe(400);
  });

  test("a student whose report has no area scores gets null summary values", async () => {
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows(
        [
          {
            attempt_id: "a1",
            profile_id: "s1",
            diagnosed_at: "2026-03-10T05:00:00Z",
            payload: {},
          },
        ],
        f,
      );

    const res = await get();

    expect(
      (res.body as { items: { detail: unknown }[] }).items[0]?.detail,
    ).toEqual({
      urgency: null,
      executionAvg: null,
      readinessAvg: null,
      weakest: null,
      diagnosedAt: "2026-03-10",
    });
  });

  test("the latest report wins when a student diagnosed more than once", async () => {
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows(
        [
          report(
            "s1",
            "a1",
            "2026-03-10T05:00:00Z",
            [10, 10, 10, 10, 10, 10],
            [10, 10, 10, 10, 10, 10],
          ),
          report(
            "s1",
            "a9",
            "2026-05-01T05:00:00Z",
            [90, 90, 90, 90, 90, 90],
            [90, 90, 90, 90, 90, 90],
          ),
        ],
        f,
      );

    const res = await get();

    expect(
      (
        res.body as {
          items: { detail: { urgency: string; diagnosedAt: string } }[];
        }
      ).items[0]?.detail,
    ).toMatchObject({ urgency: "low", diagnosedAt: "2026-05-01" });
  });

  test("goal tab: weekly rate over the 7 days ending yesterday (a target day with no record counts 0 hours, Sunday only adds to the numerator), minimum-goal days, streak and the ideal and minimum targets with probabilities", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    kit.state.rows.goal_students = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            study_schedule: { thursday: { ideal: 4, min: 2 } },
            ideal_university: "가나대",
            ideal_department: "경영학과",
            min_university: "다라대",
            min_department: "경영학과",
          },
          {
            profile_id: "s2",
            study_schedule: {},
            ideal_university: "",
            ideal_department: "",
            min_university: "",
            min_department: "",
          },
        ],
        f,
      );
    kit.state.rows.goal_student_state = (f) =>
      matchRows(
        [
          { profile_id: "s1", ideal_susi: 34.4, min_susi: 61.2 },
          { profile_id: "s2", ideal_susi: null, min_susi: null },
        ],
        f,
      );
    const record = (
      date: string,
      hours: number,
      ideal: number,
      min: number,
    ) => ({
      profile_id: "s1",
      record_date: date,
      study_hours: hours,
      target_ideal_hours: ideal,
      target_min_hours: min,
    });
    kit.state.rows.goal_daily_records = (f) =>
      matchRows(
        [
          record("2026-11-05", 3, 5, 2),
          record("2026-11-04", 5, 5, 2),
          record("2026-11-03", 1, 5, 2),
          record("2026-11-01", 2, 0, 0),
          record("2026-10-01", 9, 5, 2),
        ],
        f,
      );
    const res = await get({ service: "goal" });

    const items = (
      res.body as { items: { studentId: string; detail: unknown }[] }
    ).items;
    expect(items.map((i) => i.studentId)).toEqual(["s1", "s2"]);
    expect(items[0]?.detail).toEqual({
      // 목표일 10-29(기록 없음 0시간, 4), 11-03(1, 5), 11-04(5, 5) 와 일요일 2시간: (6 + 2) / 14
      weeklyRate: 57,
      minMetDays: 1,
      minSetDays: 3,
      streakDays: 3,
      ideal: { university: "가나대", department: "경영학과", probability: 34 },
      min: { university: "다라대", department: "경영학과", probability: 61 },
    });
    expect(items[1]?.detail).toEqual({
      weeklyRate: null,
      minMetDays: 0,
      minSetDays: 0,
      streakDays: 0,
      ideal: null,
      min: null,
    });
  });

  test("growth tab: the latest report's story theme and the story count per grade", async () => {
    kit.state.rows.growth_profiles = (f) =>
      matchRows([{ profile_id: "s1" }, { profile_id: "s2" }], f);
    kit.state.rows.growth_reports = (f) =>
      matchRows(
        [
          {
            id: "g1",
            profile_id: "s1",
            updated_at: "2026-09-01T00:00:00Z",
            narrative_theme: "옛 주제",
            grade_subthemes: [{ grade: "고1", text: "a" }],
          },
          {
            id: "g2",
            profile_id: "s1",
            updated_at: "2026-10-01T00:00:00Z",
            narrative_theme: "진로 탐색",
            grade_subthemes: [
              { grade: "고1", text: "x" },
              { grade: "고2", text: "y" },
              { grade: "고2", text: "z" },
              { text: "no grade" },
            ],
          },
        ],
        f,
      );

    const res = await get({ service: "growth" });

    const items = (
      res.body as { items: { studentId: string; detail: unknown }[] }
    ).items;
    expect(items.map((i) => i.studentId)).toEqual(["s1", "s2"]);
    expect(items[0]?.detail).toEqual({
      storyTheme: "진로 탐색",
      storiesByGrade: [
        { grade: "고1", count: 1 },
        { grade: "고2", count: 2 },
      ],
    });
    expect(items[1]?.detail).toBeNull();
  });

  test("performance tab: current step of the latest session, submitted count, feedback of the latest submission and its date", async () => {
    kit.state.rows.performance_sessions = (f) =>
      matchRows(
        [
          {
            id: "p1",
            profile_id: "s1",
            current_step: 2,
            updated_at: "2026-09-01T00:00:00Z",
          },
          {
            id: "p2",
            profile_id: "s1",
            current_step: 4,
            updated_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "p3",
            profile_id: "s2",
            current_step: 1,
            updated_at: "2026-10-02T00:00:00Z",
          },
        ],
        f,
      );
    kit.state.rows.performance_submissions = (f) =>
      matchRows(
        [
          { id: "u1", session_id: "p1", submitted_at: "2026-09-02T00:00:00Z" },
          { id: "u2", session_id: "p2", submitted_at: "2026-10-20T01:00:00Z" },
          { id: "u3", session_id: "p2", submitted_at: null },
        ],
        f,
      );
    kit.state.rows.performance_reports = (f) =>
      matchRows(
        [
          { id: "r1", session_id: "p2", report_type: "evaluation" },
          { id: "r2", session_id: "p1", report_type: "design" },
        ],
        f,
      );

    const res = await get({ service: "performance" });

    const items = (
      res.body as { items: { studentId: string; detail: unknown }[] }
    ).items;
    expect(items.map((i) => i.studentId)).toEqual(["s1", "s2"]);
    expect(items[0]?.detail).toEqual({
      step: 4,
      stage: "설계 리포트",
      submissionCount: 2,
      feedback: "done",
      lastSubmittedAt: "2026-10-20",
    });
    expect(items[1]?.detail).toEqual({
      step: 1,
      stage: "기본 정보",
      submissionCount: 0,
      feedback: null,
      lastSubmittedAt: null,
    });
  });

  test("performance tab: a latest submission without an evaluation report is waiting", async () => {
    kit.state.rows.performance_sessions = (f) =>
      matchRows(
        [
          {
            id: "p1",
            profile_id: "s1",
            current_step: 5,
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
        f,
      );
    kit.state.rows.performance_submissions = (f) =>
      matchRows(
        [{ id: "u1", session_id: "p1", submitted_at: "2026-09-02T00:00:00Z" }],
        f,
      );

    const res = await get({ service: "performance" });

    expect(
      (res.body as { items: { detail: { feedback: string } }[] }).items[0]
        ?.detail.feedback,
    ).toBe("waiting");
  });

  test("selfeval tab: the first unfinished step of the latest session and the finished-step progress", async () => {
    kit.state.rows.selfeval_sessions = (f) =>
      matchRows(
        [
          {
            id: "e1",
            profile_id: "s1",
            status: "draft",
            current_step: 9,
            updated_at: "2026-09-01T00:00:00Z",
          },
          {
            id: "e2",
            profile_id: "s1",
            status: "in_progress",
            current_step: 2,
            updated_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "e3",
            profile_id: "s2",
            status: "completed",
            current_step: 6,
            updated_at: "2026-10-02T00:00:00Z",
          },
        ],
        f,
      );

    const res = await get({ service: "selfeval" });

    const items = (res.body as { items: { detail: unknown }[] }).items;
    expect(items[0]?.detail).toEqual({ stage: "분석 확인", progressPct: 50 });
    expect(items[1]?.detail).toEqual({
      stage: "검증과 저장",
      progressPct: 100,
    });
  });

  test("inquiry tab: the current step name, whether a topic is confirmed, and progress", async () => {
    kit.state.rows.inquiry_sessions = (f) =>
      matchRows(
        [
          {
            id: "i1",
            profile_id: "s1",
            status: "in_progress",
            current_step: 4,
            selected_topic_id: "t1",
            updated_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "i2",
            profile_id: "s2",
            status: "in_progress",
            current_step: 2,
            selected_topic_id: null,
            updated_at: "2026-10-02T00:00:00Z",
          },
        ],
        f,
      );

    const res = await get({ service: "inquiry" });

    const items = (res.body as { items: { detail: unknown }[] }).items;
    expect(items[0]?.detail).toEqual({
      stage: "보고서 작성",
      topicConfirmed: true,
      progressPct: 50,
    });
    expect(items[1]?.detail).toEqual({
      stage: "주제 추천",
      topicConfirmed: false,
      progressPct: 17,
    });
  });

  test("asOf is today's date in KST and orgType tells school from academy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));

    const res = await get();

    expect(res.body).toMatchObject({ asOf: "2026-11-06", orgType: "학교" });
  });
});
