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

  test("classId and q narrow the list; q matches the real name", async () => {
    kit.state.actor = schoolAdminActor();

    const byClass = await get({ classId: "c-B" });
    const byName = await get({ q: "서연" });

    expect((byClass.body as { total: number }).total).toBe(1);
    expect(
      (byName.body as { items: { studentId: string }[] }).items.map(
        (i) => i.studentId,
      ),
    ).toEqual(["s1"]);
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
});
