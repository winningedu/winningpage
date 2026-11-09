// GET /api/console/coaching 계약 검증(W9). 범위, 이름 가림, 서비스 자료에서 판정까지 이어지는 값.

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

import handler from "./coaching.js";

const get = (query: Record<string, string> = { studentId: "s1" }) =>
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

type Body = {
  student: Record<string, unknown>;
  axes: { key: string; score: number | null; status: string }[];
  verdicts: Record<string, { level: string; reason?: string }>;
  signal: string;
  signalSubLine: string;
  coachingType: { code: string };
  summary: string;
  goalWeek: Record<string, unknown>;
  competencies: { key: string; score: number | null }[];
};

describe("GET /api/console/coaching", () => {
  test("a missing studentId is a 400", async () => {
    expect((await get({})).status).toBe(400);
  });

  test("opening a student leaves a view audit record and a failing audit write fails the request", async () => {
    const r = await get({ studentId: "s1" });
    expect(r.status).toBe(200);
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs"),
    ).toEqual([
      {
        table: "admin_access_logs",
        row: expect.objectContaining({
          action: "view",
          resource_key: "coaching",
          target_id: "s1",
        }),
      },
    ]);

    kit.state.insertErrors.admin_access_logs = { message: "down" };
    expect((await get({ studentId: "s1" })).status).toBe(500);
  });

  test("a rejected request leaves no audit record", async () => {
    await get({ studentId: "s9" });
    expect(kit.state.inserts).toEqual([]);
  });

  test("a student of another tenant, a graduate and an unknown id are 404", async () => {
    expect((await get({ studentId: "s9" })).status).toBe(404);
    expect((await get({ studentId: "s5" })).status).toBe(404);
    expect((await get({ studentId: "nobody" })).status).toBe(404);
  });

  test("a homeroom can open a student of own class and gets 404 for another class", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    const own = await get({ studentId: "s1" });
    expect(own.status).toBe(200);
    expect((own.body as Body).student.name).toBe("김서연");
    expect((await get({ studentId: "s2" })).status).toBe(404);
  });

  test("a school admin sees a masked name and the identity block of the student", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect((r.body as Body).student).toMatchObject({
      id: "s1",
      name: "김*연",
      grade: "고2",
      className: "3",
      number: 1,
      homeroomName: "박지훈",
      servicesUsed: 4,
      services: {
        diagnosis: "using",
        goal: "using",
        growth: "not_joined",
        performance: "using",
        selfeval: "not_joined",
        inquiry: "using",
      },
      targets: {
        ideal: { university: "가나대", department: "경영학과" },
        min: { university: "다라대", department: "경영학과" },
      },
    });
  });

  describe("target university probability (결정 106.5)", () => {
    const state = (row: Record<string, unknown> | null) => {
      kit.state.rows.goal_student_state = (f) =>
        matchRows(row ? [{ profile_id: "s1", ...row }] : [], f);
    };
    const targetsOf = async () =>
      ((await get()).body as Body).student.targets as Record<
        string,
        Record<string, unknown> | null
      >;

    test("the susi probabilities of the goal state are rounded to integers on each target", async () => {
      state({ ideal_susi: 33.6, min_susi: 61.2 });
      const targets = await targetsOf();
      expect(targets.ideal).toEqual({
        university: "가나대",
        department: "경영학과",
        probability: 34,
      });
      expect(targets.min).toEqual({
        university: "다라대",
        department: "경영학과",
        probability: 61,
      });
    });

    test("a missing state row or a null susi keeps the target names and leaves probability null", async () => {
      state(null);
      const none = await targetsOf();
      expect(none.ideal).toEqual({
        university: "가나대",
        department: "경영학과",
        probability: null,
      });
      state({ ideal_susi: null, min_susi: 0 });
      const partial = await targetsOf();
      expect(partial.ideal?.probability).toBeNull();
      expect(partial.min?.probability).toBe(0);
    });

    test("a student without the goal service has no targets and the state is not read", async () => {
      const body = (await get({ studentId: "s3" })).body as Body;
      expect(body.student.targets).toBeNull();
      expect(kit.state.reads.map((r) => r.table)).not.toContain(
        "goal_student_state",
      );
    });
  });

  test("the goal week, the verdicts, the axes and the signal come from the services' own data", async () => {
    const body = (await get()).body as Body;
    expect(body.goalWeek).toMatchObject({ setDays: 6, metDays: 4 });
    expect(body.verdicts.execution).toEqual({ level: "caution" });
    expect(body.verdicts.learning).toEqual({ level: "caution" });
    const axis = Object.fromEntries(body.axes.map((a) => [a.key, a]));
    // 실행 (62 + 71.7 + 66.7) / 3
    expect(axis.execution).toMatchObject({ score: 67, status: "scored" });
    expect(axis.readiness).toMatchObject({ score: 76 });
    // 수행평가 평가 점수 73, 피드백 완료율 1/2 = 50, 수행 대응 80
    expect(axis.performance).toMatchObject({ score: 68 });
    expect(axis.inquiry).toMatchObject({ score: null, status: "before_eval" });
    expect(axis.selfAssessment).toMatchObject({
      score: null,
      status: "not_used",
    });
    expect(body.signal).toBe("caution");
    expect(body.signalSubLine).toBe("실행 주의, 학습역량 주의, 연계 주의");
    expect(body.summary).toContain("6축 중 4축 산출");
  });

  describe("last access (결정 105)", () => {
    // 오늘은 2026-11-02(KST). 접속 시각은 KST 날짜로 센다.
    const seenAt = (lastSeen: string | null) => {
      kit.state.rows.profiles = (f) =>
        matchRows(
          [
            { id: "s1", name: "김서연", last_seen_at: lastSeen },
            { id: "s2", name: "윤하린" },
            { id: "s3", name: "이서준" },
          ],
          f,
        );
    };

    test("7 days since the last access is risk 미접속 and type C1, even when the week has no target days", async () => {
      seenAt("2026-10-26T23:50:00+09:00");
      kit.state.rows.goal_daily_records = () => [];
      const body = (await get()).body as Body;
      expect(body.verdicts.execution).toEqual({
        level: "risk",
        reason: "미접속",
      });
      expect(body.coachingType.code).toBe("C1");
    });

    test("7 days since the last access with target days in the week is 미접속 and C1, and the goal opinion keeps its details", async () => {
      seenAt("2026-10-26T23:50:00+09:00");
      const r = await get();
      const body = r.body as Body;
      expect(body.verdicts.execution).toEqual({
        level: "risk",
        reason: "미접속",
      });
      expect(body.coachingType.code).toBe("C1");
      expect(
        (r.body as { text: { goalOpinion: { details: unknown } } }).text
          .goalOpinion.details,
      ).not.toBeNull();
    });

    test("6 days since the last access is not 미접속, and a missing record skips the rule", async () => {
      seenAt("2026-10-27T00:10:00+09:00");
      expect(((await get()).body as Body).verdicts.execution).toEqual({
        level: "caution",
      });

      seenAt(null);
      const body = (await get()).body as Body;
      expect(body.verdicts.execution).toEqual({ level: "caution" });
      expect(body.student.lastSeenAt).toBeNull();
    });

    test("a student who does not use goal stays no_data however long the absence", async () => {
      seenAt("2026-10-01T00:00:00+09:00");
      kit.state.rows.profiles = (f) =>
        matchRows(
          [{ id: "s3", name: "이서준", last_seen_at: "2026-10-01T00:00:00Z" }],
          f,
        );
      const body = (await get({ studentId: "s3" })).body as Body;
      expect(body.verdicts.execution).toEqual({ level: "no_data" });
      expect(body.coachingType.code).not.toBe("C1");
    });

    test("the C1 sentence carries the real day count, and Sunday study without target days prints no Infinity", async () => {
      seenAt("2026-10-23T12:00:00+09:00");
      kit.state.rows.goal_daily_records = () => [
        {
          id: 1,
          profile_id: "s1",
          record_date: "2026-11-01",
          record_index: 1,
          target_ideal_hours: 0,
          target_min_hours: 0,
          study_hours: 2,
        },
      ];
      const r = await get();
      const json = JSON.stringify(r.body);
      expect(json).toContain("최근 10일간 접속 기록이 없습니다");
      expect(json).not.toContain("Infinity");
      expect(
        (r.body as { text: { goalOpinion: unknown } }).text.goalOpinion,
      ).toEqual({
        summary:
          "최근 10일간 접속 기록이 없습니다. 실행이 어려웠던 이유를 학생 말로 먼저 듣고, 최소 목표시간만 지키는 것부터 다시 시작하세요.",
        details: null,
      });
    });

    test("the response carries the raw last access time of the student", async () => {
      seenAt("2026-10-26T14:50:00.000Z");
      expect(((await get()).body as Body).student.lastSeenAt).toBe(
        "2026-10-26T14:50:00.000Z",
      );
    });
  });

  test("a student who uses nothing has no scored axis and insufficient data", async () => {
    const body = (await get({ studentId: "s3" })).body as Body;
    expect(body.axes.every((a) => a.score === null)).toBe(true);
    expect(body.signal).toBe("insufficient");
    expect(body.verdicts.execution).toEqual({ level: "no_data" });
    expect(body.summary).toBe(
      "6종 서비스 결과가 아직 없어 6축 종합 진단을 산출할 수 없습니다.",
    );
  });

  test("growth verdicts, the grade curve and the self-assessment verification feed the competencies and the axes", async () => {
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
            axis_scores: [
              { axis: "C", count: 1, required: 2, verdict: "caution" },
              { axis: "E", count: 2, required: 2, verdict: "confirmed" },
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
    const body = (await get()).body as Body;
    const comp = Object.fromEntries(body.competencies.map((c) => [c.key, c]));
    // 탐구: 판정 주의 25 + 60 x 1/2 = 55, 주제 적합도 50, 탐구 심화 80 -> 62
    expect(comp.inquiry?.score).toBe(62);
    // 발전가능성: 확인됨 85, 성적 곡선 상승 80, 학습진단 성적 흐름 상승 80 -> 82
    expect(comp.potential?.score).toBe(82);
    // 자기평가 충실도: 검증 90 과 기록 정리 80 의 평균
    expect(body.axes.find((a) => a.key === "selfAssessment")).toMatchObject({
      score: 85,
      status: "scored",
    });
  });

  test("the naesin and mock exam records become change scores for the potential competency (연결표 r41, r42)", async () => {
    kit.state.rows.goal_students = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            grade: "고2",
            ideal_university: "가나대",
            ideal_department: "경영학과",
            min_university: "다라대",
            min_department: "경영학과",
            naesin_scores: {
              records: [
                { term: "a", enteredAt: "2026-03-01", value: 3, none: false },
                { term: "b", enteredAt: "2026-07-01", value: 2, none: false },
              ],
            },
            mock_exam_scores: {
              records: [
                { term: "a", examDate: "2026-03-20", value: 80 },
                { term: "b", examDate: "2026-06-20", value: 84 },
              ],
            },
          },
        ],
        f,
      );
    const body = (await get()).body as Body;
    const potential = body.competencies.find((c) => c.key === "potential");
    // 5등급제(2028학년도 대입): 3 -> 2 는 90, 백분위 80 -> 84 는 60, 학습진단 성적 흐름 상승 80
    expect(potential).toMatchObject({ score: 77, basisUsed: 3 });
  });

  test("the text sections come from the same data (보완, 목표관리 의견, 진로계획, 서비스 카드)", async () => {
    kit.state.rows.performance_sessions = (f) =>
      matchRows(
        [
          {
            id: "p1",
            profile_id: "s1",
            selected_topic_id: null,
            subject: "국어",
          },
          {
            id: "p2",
            profile_id: "s1",
            selected_topic_id: "pt2",
            subject: "수학",
          },
        ],
        f,
      );
    kit.state.rows.performance_topics = (f) =>
      matchRows([{ id: "pt2", title: "통계로 본 우리 동네" }], f);
    kit.state.rows.inquiry_topics = (f) =>
      matchRows(
        [{ id: "it1", fit: "보통", detail: { title: "도시 열섬 완화 방안" } }],
        f,
      );
    const body = (await get()).body as Body & {
      text: {
        weaknesses: string[];
        studyMethods: string[];
        careerPlan: { label: string; items: string[] }[];
        goalOpinion: { summary: string; details: { distractions: string } };
      };
      serviceCards: {
        service: string;
        state: string;
        chip: string;
        value: string;
      }[];
    };
    expect(body.text.weaknesses[0]).toBe(
      "목표시간 달성율 72%, 최소 충족 4/6일: 계획 조정 필요",
    );
    expect(body.text.weaknesses).toHaveLength(3);
    expect(body.text.careerPlan[0]?.items).toContain(
      "수행평가 '통계로 본 우리 동네'(수학) 피드백 반영 후 재제출",
    );
    expect(body.text.studyMethods[2]).toBe(
      "수학 수행평가 피드백을 다음 제출 전 체크리스트로 만들기",
    );
    expect(body.text.goalOpinion.summary).toContain("목표시간 달성율 72%");
    const cards = Object.fromEntries(
      body.serviceCards.map((c) => [c.service, c]),
    );
    expect(cards.diagnosis).toMatchObject({
      state: "using",
      chip: "진단 완료",
    });
    expect(cards.goal).toMatchObject({ state: "using", value: "달성율 72%" });
    expect(cards.growth).toMatchObject({
      state: "not_joined",
      chip: "서비스 이용 전",
    });
    expect(cards.performance).toMatchObject({
      value: "제출 2건",
      chip: "피드백 대기",
    });
  });
});
