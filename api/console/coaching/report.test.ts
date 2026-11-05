// GET /api/console/coaching/report 계약 검증(W9b 리포트 보기 전용). 글만 돌려주고 열람마다 report_view 를 남긴다.

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

import handler from "./report.js";

const get = (query: Record<string, string>) =>
  callHandler(handler, undefined, "GET", query);

const enrollment = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  grade: "고2",
  class_id: "c-A",
  number: 1,
  ...over,
});

// 학습진단 payload: 1쪽 6영역(학습 실행 역량)과 2쪽 6영역(준비도). 이름은 AREA_LABEL 이다.
const DIAGNOSIS_PAYLOAD = {
  learningAxes: [
    { name: "목표 설정", score: 62 },
    { name: "계획 설계", score: 60 },
    { name: "실행 지속", score: 62 },
    { name: "시간 관리", score: 62 },
    { name: "학습 피드백", score: 64 },
    { name: "학습 안정", score: 62 },
  ],
  readiness: {
    areas: [
      { name: "교과 관리", score: 74 },
      { name: "수행 대응", score: 80 },
      { name: "탐구 심화", score: 80 },
      { name: "활동 연계", score: 76 },
      { name: "기록 정리", score: 80 },
      { name: "입시 전략", score: 78 },
    ],
  },
};

// 오늘 2026-11-02(월). 최근 7일 목표 기록.
const RECORDS = [
  ["2026-11-02", 5, 3, 5],
  ["2026-10-31", 5, 3, 2],
  ["2026-10-30", 5, 3, 4],
  ["2026-10-29", 5, 3, 2],
  ["2026-10-28", 5, 3, 5.5],
  ["2026-10-27", 5, 3, 3],
  ["2026-10-20", 5, 3, 3], // 7일 밖
].map(([record_date, ideal, min, hours], id) => ({
  id,
  profile_id: "s1",
  record_date,
  record_index: 1,
  target_ideal_hours: ideal,
  target_min_hours: min,
  study_hours: hours,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T03:00:00+09:00"));
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment({ student_id: "s1", number: 1 }),
        enrollment({ student_id: "s2", class_id: "c-B", number: 2 }),
        enrollment({ student_id: "s3", number: 3 }),
        enrollment({
          student_id: "s9",
          tenant_id: "tenant-2",
          class_id: "c-X",
        }),
        enrollment({ student_id: "s5", status: "graduated" }),
      ],
      f,
    );
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
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김서연" },
        { id: "s2", name: "윤하린" },
        { id: "s3", name: "이서준" },
      ],
      f,
    );
  kit.state.rows.teacher_class_assignments = (f) =>
    matchRows(
      [{ class_id: "c-A", teacher_id: "t1", tenant_id: "tenant-1" }],
      f,
    );
  kit.state.rows.teachers = (f) =>
    matchRows([{ id: "t1", name: "박지훈", tenant_id: "tenant-1" }], f);
  // s1 은 학습진단, 목표관리, 수행평가, 심화탐구를 쓴다. s3 은 아무것도 쓰지 않는다.
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "s1" }], f);
  kit.state.rows.diagnosis_reports = (f) =>
    matchRows(
      [
        {
          attempt_id: "d1",
          profile_id: "s1",
          diagnosed_at: "2026-03-10T00:00:00Z",
          payload: DIAGNOSIS_PAYLOAD,
          snapshot: { gradeTrend: "UP_MOST" },
        },
      ],
      f,
    );
  kit.state.rows.goal_students = (f) =>
    matchRows(
      [
        {
          profile_id: "s1",
          ideal_university: "가나대",
          ideal_department: "경영학과",
          min_university: "다라대",
          min_department: "경영학과",
        },
      ],
      f,
    );
  kit.state.rows.goal_daily_records = (f) => matchRows(RECORDS, f);
  kit.state.rows.growth_profiles = () => [];
  kit.state.rows.growth_reports = () => [];
  kit.state.rows.performance_sessions = (f) =>
    matchRows(
      [
        { id: "p1", profile_id: "s1" },
        { id: "p2", profile_id: "s1" },
      ],
      f,
    );
  kit.state.rows.performance_reports = (f) =>
    matchRows(
      [{ id: "pr1", session_id: "p1", report_type: "evaluation", score: 73 }],
      f,
    );
  kit.state.rows.selfeval_sessions = () => [];
  kit.state.rows.selfeval_reports = () => [];
  kit.state.rows.inquiry_sessions = (f) =>
    matchRows(
      [
        {
          id: "i1",
          profile_id: "s1",
          selected_topic_id: "it1",
          latest_evaluation_id: null,
          created_at: "2026-10-01",
        },
      ],
      f,
    );
  kit.state.rows.inquiry_topics = (f) =>
    matchRows([{ id: "it1", fit: "보통" }], f);
  kit.state.rows.inquiry_reports = () => [];
});

afterEach(() => {
  vi.useRealTimers();
});

const audits = () =>
  kit.state.inserts.filter((i) => i.table === "admin_access_logs");

describe("GET /api/console/coaching/report", () => {
  test("a bad service or a missing student is 400", async () => {
    expect((await get({ studentId: "s1", service: "x" })).status).toBe(400);
    expect((await get({ service: "diagnosis" })).status).toBe(400);
  });

  test("a student out of scope is 404 and leaves no record", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
      teacher_id: "t",
    });
    expect((await get({ studentId: "s2", service: "diagnosis" })).status).toBe(
      404,
    );
    expect(audits()).toEqual([]);
  });

  test("diagnosis: the summary lines as text, and one report_view record", async () => {
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows(
        [
          {
            attempt_id: "d1",
            profile_id: "s1",
            created_at: "2026-03-10",
            diagnosed_at: "2026-03-10",
            payload: {
              ...DIAGNOSIS_PAYLOAD,
              headlineLines: ["계획 설계가 가장 시급해요", "실행은 보통이에요"],
              readiness: {
                ...DIAGNOSIS_PAYLOAD.readiness,
                summaryLines: ["준비도는 점검이 필요해요"],
              },
            },
            snapshot: {},
          },
        ],
        f,
      );
    const r = await get({ studentId: "s1", service: "diagnosis" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      title: "학습진단 리포트",
      summary: "",
      sections: [
        { title: "요약", text: "계획 설계가 가장 시급해요\n실행은 보통이에요" },
        { title: "학교생활 준비도", text: "준비도는 점검이 필요해요" },
      ],
    });
    expect(audits()).toHaveLength(1);
    expect(audits()[0]?.row).toMatchObject({
      action: "report_view",
      resource_key: "coachingReport",
      target_id: "s1",
      meta: { service: "diagnosis" },
    });
  });

  test("performance: the summary and the titled sections of the latest evaluation report", async () => {
    kit.state.rows.performance_reports = (f) =>
      matchRows(
        [
          {
            id: "pr1",
            session_id: "p1",
            report_type: "evaluation",
            score: 73,
            created_at: "2026-10-01",
            summary: "이전 평가",
            sections: [],
          },
          {
            id: "pr2",
            session_id: "p1",
            report_type: "evaluation",
            score: 80,
            created_at: "2026-10-20",
            summary: "수행평가 종합 의견",
            sections: [
              {
                title: "보완할 점",
                body: ["근거를 더 쓰세요"],
                format: "list",
              },
            ],
          },
        ],
        f,
      );
    const r = await get({ studentId: "s1", service: "performance" });
    expect(r.body).toEqual({
      title: "수행평가 리포트",
      summary: "수행평가 종합 의견",
      sections: [{ title: "보완할 점", text: "근거를 더 쓰세요" }],
    });
  });

  test("goal has no stored report, and a service the student does not use has none either", async () => {
    expect((await get({ studentId: "s1", service: "goal" })).status).toBe(404);
    expect(
      (await get({ studentId: "s1", service: "selfeval" })).body,
    ).toMatchObject({
      error: { code: "NO_REPORT" },
    });
    expect(audits()).toEqual([]);
  });

  test("a failed audit write is a 500, so a report is never shown unrecorded", async () => {
    kit.state.insertErrors.admin_access_logs = { code: "XX000" };
    kit.state.rows.diagnosis_reports = (f) =>
      matchRows(
        [
          {
            attempt_id: "d1",
            profile_id: "s1",
            created_at: "2026-03-10",
            payload: { headlineLines: ["요약"] },
          },
        ],
        f,
      );
    expect((await get({ studentId: "s1", service: "diagnosis" })).status).toBe(
      500,
    );
  });
});
