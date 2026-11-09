// GET /api/console/coaching/service 계약 검증(W9a 서비스 상세 창). 서비스마다 같은 모양, 범위는 코칭 조회와 같다.

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

import handler from "./service.js";

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
  student: {
    schoolType: "일반고",
    gpa: "2.60등급(5등급제)",
    gradeTrend: "상승",
    diagnosedAt: "2026.03.10",
  },
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

// 직전 진단: 모든 영역이 같은 점수(실행 58, 준비도 69).
const PREVIOUS_PAYLOAD = {
  learningAxes: DIAGNOSIS_PAYLOAD.learningAxes.map((a) => ({
    ...a,
    score: 58,
  })),
  readiness: {
    areas: DIAGNOSIS_PAYLOAD.readiness.areas.map((a) => ({ ...a, score: 69 })),
  },
};

// 오늘 2026-11-02(월). 이번 주 = 어제까지 7일(10-26 ~ 11-01), 오늘 기록은 계산에 넣지 않는다.
const RECORDS = [
  ["2026-11-02", 5, 3, 0], // 오늘, 이번 주 밖
  ["2026-10-26", 5, 3, 5],
  ["2026-10-31", 5, 3, 2],
  ["2026-10-30", 5, 3, 4],
  ["2026-10-29", 5, 3, 2],
  ["2026-10-28", 5, 3, 5.5],
  ["2026-10-27", 5, 3, 3],
  ["2026-10-20", 5, 3, 3], // 지난주 밖
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
        {
          attempt_id: "d0",
          profile_id: "s1",
          diagnosed_at: "2026-01-10T00:00:00Z",
          payload: PREVIOUS_PAYLOAD,
          snapshot: {},
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
  kit.state.rows.goal_student_state = () => [];
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

type Detail = {
  title: string;
  metrics: { label: string; value: string; sub?: string }[];
  table: { columns: string[]; rows: string[][] } | null;
  points: string[];
  summary?: string | null;
  bars?: { group: string; name: string; target?: number }[];
  secondTable?: { heading: string; rows: string[][] };
  notice?: string;
};
const detailOf = async (service: string) =>
  ((await get({ studentId: "s1", service })).body as { detail: Detail }).detail;

describe("GET /api/console/coaching/service", () => {
  test("a bad service name or a missing student is 400", async () => {
    expect((await get({ studentId: "s1", service: "x" })).status).toBe(400);
    expect((await get({ service: "goal" })).status).toBe(400);
  });

  test("opening a service detail leaves a view audit record, a failing audit write fails the request, and a rejected request leaves none", async () => {
    const r = await get({ studentId: "s1", service: "goal" });
    expect(r.status).toBe(200);
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs"),
    ).toEqual([
      {
        table: "admin_access_logs",
        row: expect.objectContaining({
          action: "view",
          resource_key: "coachingService",
          target_id: "s1",
          meta: { service: "goal" },
        }),
      },
    ]);

    kit.state.inserts.length = 0;
    expect((await get({ studentId: "s9", service: "goal" })).status).toBe(404);
    expect((await get({ studentId: "s1", service: "growth" })).status).toBe(
      404,
    );
    expect(kit.state.inserts).toEqual([]);

    kit.state.insertErrors.admin_access_logs = { message: "down" };
    expect((await get({ studentId: "s1", service: "goal" })).status).toBe(500);
  });

  test("a student out of scope is 404, and so is a service the student does not use", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
      teacher_id: "t",
    });
    expect((await get({ studentId: "s2", service: "goal" })).status).toBe(404);
    const r = await get({ studentId: "s1", service: "growth" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: { code: "SERVICE_NOT_USED" } });
  });

  test("goal: metrics, the 14 day table and the counsel point", async () => {
    const d = await detailOf("goal");
    expect(d.title).toBe("목표관리 상세");
    expect(d.metrics).toContainEqual({
      label: "최소 목표시간 충족",
      value: "4일 / 6일",
    });
    expect(d.metrics).toContainEqual({
      label: "이상 목표대학",
      value: "가나대 경영학과",
    });
    expect(d.table?.columns).toEqual([
      "날짜",
      "요일",
      "이상",
      "최소",
      "실제",
      "일별 달성율",
      "최소 충족",
    ]);
    expect(d.table?.rows).toHaveLength(14);
    // 최근 날짜부터: 어제(일요일)가 첫 줄이고 오늘 기록은 표에 없다
    expect(d.table?.rows[0]).toEqual([
      "11.01",
      "일",
      "목표 없음",
      "",
      "0분",
      "",
      "주간 달성율에 가산",
    ]);
    expect(d.table?.rows[1]).toEqual([
      "10.31",
      "토",
      "5시간",
      "3시간",
      "2시간",
      "40%",
      "못 지킴",
    ]);
    expect(d.table?.rows.some((r) => r[0] === "11.02")).toBe(false);
    expect(d.table?.rows.find((r) => r[0] === "10.28")?.[4]).toBe("5시간 30분");
    expect(d.points[0]).toContain("목표시간 달성율 72%");
  });

  test("goal: target probability metric with the reference notice, 미산출 for a missing side", async () => {
    kit.state.rows.goal_student_state = (f) =>
      matchRows([{ profile_id: "s1", ideal_susi: 33.6, min_susi: 61.2 }], f);
    const d = await detailOf("goal");
    expect(d.metrics).toContainEqual({
      label: "목표대학 확률 (이상 / 최소)",
      value: "34% / 61%",
    });
    expect(d.notice).toBe(
      "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
    );

    kit.state.rows.goal_student_state = (f) =>
      matchRows([{ profile_id: "s1", ideal_susi: null, min_susi: 61.2 }], f);
    expect((await detailOf("goal")).metrics).toContainEqual({
      label: "목표대학 확률 (이상 / 최소)",
      value: "미산출 / 61%",
    });
  });

  test("goal: no probability at all shows neither the metric nor the notice", async () => {
    const d = await detailOf("goal");
    expect(d.metrics.some((m) => m.label.startsWith("목표대학 확률"))).toBe(
      false,
    );
    expect(d.notice).toBeUndefined();
  });

  test("diagnosis: three metric blocks, summary, 12 area bars and the priority table", async () => {
    const d = await detailOf("diagnosis");
    expect(d.metrics).toEqual([
      {
        label: "학습 실행 역량(6영역 평균)",
        value: "62점",
        sub: "직전 진단 58점",
      },
      { label: "학교생활 준비도", value: "78점", sub: "직전 진단 69점" },
      { label: "학습진단 긴급도", value: "보통", sub: "40점 미만 영역 0개" },
    ]);
    expect(d.summary).toBe(
      "학교 유형 일반고, 전체 평균 내신 2.60등급(5등급제), 성적 흐름 상승, 진단일 2026.03.10. 가장 시급한 영역 계획 설계 60점, 목표까지 15점",
    );
    expect(d.table).toBeNull();
    expect(d.bars).toHaveLength(12);
    expect(d.bars?.[1]).toMatchObject({
      group: "execution",
      name: "계획 설계",
      score: 60,
      status: "보통",
      target: 75,
    });
    expect(d.secondTable?.rows[0]).toEqual([
      "1순위",
      "계획 설계",
      "60점",
      "보통",
      "월간 계획을 주간, 일간으로 분해",
    ]);
  });

  test("performance: counts, average and the list with the feedback state", async () => {
    const d = await detailOf("performance");
    expect(d.metrics).toContainEqual({ label: "제출", value: "2건" });
    expect(d.metrics).toContainEqual({ label: "피드백 완료", value: "1건" });
    expect(d.table?.rows.map((r) => r[2])).toEqual([
      "피드백 완료",
      "피드백 대기",
    ]);
  });

  test("inquiry: topic, fit and the score before evaluation", async () => {
    const d = await detailOf("inquiry");
    expect(d.metrics).toContainEqual({ label: "주제 적합도", value: "보통" });
    expect(d.metrics).toContainEqual({ label: "평가 점수", value: "평가 전" });
  });

  test("growth and self-assessment come from their own reports", async () => {
    kit.state.rows.growth_profiles = (f) =>
      matchRows([{ profile_id: "s1" }], f);
    kit.state.rows.growth_reports = (f) =>
      matchRows(
        [
          {
            id: "g1",
            profile_id: "s1",
            status: "completed",
            created_at: "2026-10-01",
            narrative_theme: "지속가능한 도시",
            axis_scores: [
              { axis: "A", count: 2, required: 5, verdict: "caution" },
            ],
            sections: [
              { id: "1-12", status: "ok", body: { verdict: "rising" } },
            ],
          },
        ],
        f,
      );
    kit.state.rows.selfeval_sessions = (f) =>
      matchRows([{ id: "se1", profile_id: "s1" }], f);
    kit.state.rows.selfeval_reports = (f) =>
      matchRows(
        [
          {
            id: "r1",
            profile_id: "s1",
            report_type: "verification",
            score: 90,
            created_at: "2026-10-28",
          },
        ],
        f,
      );

    const g = await detailOf("growth");
    expect(g.metrics).toContainEqual({
      label: "스토리 주제",
      value: "지속가능한 도시",
    });
    expect(g.metrics).toContainEqual({ label: "성적 곡선", value: "상승곡선" });
    expect(g.table?.rows).toEqual([["학업역량", "주의", "2 / 5"]]);
    expect((await detailOf("selfeval")).metrics).toEqual([
      { label: "검증 결과", value: "90점" },
    ]);
  });
});
