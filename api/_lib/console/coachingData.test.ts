// 코칭 자료 읽기(W9). 문구와 상세 창이 쓸 서비스 상태 사실이 서비스 테이블에서 바르게 읽히는지 본다.

import { beforeEach, describe, expect, test } from "vitest";
import { loadCoachingData } from "./coachingData.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "./consoleTestKit.js";
import { v3Payload } from "./diagnosisV3TestKit.js";

let kit: KitState;

const load = (
  used: Parameters<typeof loadCoachingData>[2],
  viewerZone = "Asia/Seoul",
  now?: Date,
) =>
  loadCoachingData(createFakeAdmin(kit) as never, "s1", used, viewerZone, now);

const inquiry = (rows: Record<string, unknown>[]) => {
  kit.rows.inquiry_sessions = (f) =>
    matchRows(
      rows.map((r) => ({ profile_id: "s1", ...r })),
      f,
    );
};

beforeEach(() => {
  kit = createKitState();
  kit.rows.profiles = () => [];
  kit.rows.inquiry_topics = (f) =>
    matchRows(
      [
        { id: "t1", fit: "맞음", detail: { title: "도시 재생" } },
        { id: "t2", fit: "보통", detail: { title: "오래된 주제" } },
      ],
      f,
    );
  kit.rows.inquiry_reports = () => [];
});

describe("inquiry stage and topic (결정 106.2)", () => {
  test("the session edited last supplies the topic and the console stage name", async () => {
    inquiry([
      {
        id: "old",
        created_at: "2026-10-15",
        updated_at: "2026-10-30",
        current_step: 6,
        status: "completed",
        selected_topic_id: "t2",
        latest_evaluation_id: null,
      },
      {
        id: "new",
        created_at: "2026-10-01",
        updated_at: "2026-11-05",
        current_step: 4,
        status: "in_progress",
        selected_topic_id: "t1",
        latest_evaluation_id: null,
      },
    ]);
    const data = await load(["inquiry"]);
    expect(data.inquiryTopic).toBe("도시 재생");
    expect(data.inquiryStage).toEqual({
      step: 4,
      name: "보고서 작성",
      completed: false,
    });
  });

  test("a completed session shows the last step, with no topic when none is chosen", async () => {
    inquiry([
      {
        updated_at: "2026-11-05",
        current_step: 2,
        status: "completed",
        selected_topic_id: null,
        latest_evaluation_id: null,
      },
    ]);
    const data = await load(["inquiry"]);
    expect(data.inquiryTopic).toBeNull();
    expect(data.inquiryStage).toEqual({
      step: 2,
      name: "확정과 저장",
      completed: true,
    });
  });

  test("no session, or the service not used, gives no stage", async () => {
    inquiry([]);
    expect((await load(["inquiry"])).inquiryStage).toBeNull();
    expect((await load([])).inquiryStage).toBeNull();
  });
});

describe("self-assessment stage (결정 106.3)", () => {
  const selfeval = (rows: Record<string, unknown>[]) => {
    kit.rows.selfeval_sessions = (f) =>
      matchRows(
        rows.map((r) => ({ profile_id: "s1", ...r })),
        f,
      );
    kit.rows.selfeval_reports = () => [];
  };
  const stageOf = async () => (await load(["selfeval"])).selfevalStage;

  test("the session edited last gives the stage still to do, using the W8 step names", async () => {
    selfeval([
      { updated_at: "2026-11-06", current_step: 2, status: "in_progress" },
      { updated_at: "2026-10-01", current_step: 6, status: "completed" },
    ]);
    // current_step 2 = 시작, 기본 입력, 활동 선택 이 끝났고 다음은 분석 확인이다.
    expect(await stageOf()).toEqual({
      step: 2,
      name: "분석 확인",
      finished: false,
    });
  });

  test("the last stage, a completed session, no session and an unused service end the progression", async () => {
    selfeval([{ updated_at: "2026-11-06", current_step: 5, status: "active" }]);
    expect(await stageOf()).toMatchObject({
      name: "검증과 저장",
      finished: true,
    });
    selfeval([
      { updated_at: "2026-11-06", current_step: 6, status: "completed" },
    ]);
    expect(await stageOf()).toMatchObject({ finished: true });
    selfeval([{ updated_at: "2026-11-06", current_step: 0, status: "active" }]);
    expect(await stageOf()).toMatchObject({ name: "시작", finished: false });
    selfeval([]);
    expect(await stageOf()).toBeNull();
    expect((await load([])).selfevalStage).toBeNull();
  });
});

describe("previous diagnosis and report meta (결정 106.4)", () => {
  const payload = (score: number, student?: Record<string, unknown>) => ({
    ...(student ? { student } : {}),
    learningAxes: [
      "목표 설정",
      "계획 설계",
      "실행 지속",
      "시간 관리",
      "학습 피드백",
      "학습 안정",
    ].map((name) => ({ name, score })),
    readiness: {
      areas: [
        "교과 관리",
        "수행 대응",
        "탐구 심화",
        "활동 연계",
        "기록 정리",
        "입시 전략",
      ].map((name) => ({ name, score })),
    },
  });
  const reports = (
    rows: { diagnosed_at: string; payload: unknown; attempt_id: string }[],
  ) => {
    kit.rows.diagnosis_reports = (f) =>
      matchRows(
        rows.map((r) => ({ profile_id: "s1", snapshot: null, ...r })),
        f,
      );
  };

  test("the report before the latest by diagnosed_at gives the previous areas, and the latest gives the meta without 미입력 values", async () => {
    reports([
      {
        attempt_id: "a3",
        diagnosed_at: "2026-01-10T00:00:00Z",
        payload: payload(50),
      },
      {
        attempt_id: "a1",
        diagnosed_at: "2026-03-10T00:00:00Z",
        payload: payload(70, {
          schoolType: "일반고",
          gpa: "2.60등급(5등급제)",
          gradeTrend: "미입력",
          diagnosedAt: "2026.03.10",
        }),
      },
      {
        attempt_id: "a2",
        diagnosed_at: "2026-02-10T00:00:00Z",
        payload: payload(60),
      },
    ]);
    const data = await load(["diagnosis"]);
    expect(data.metrics.diagnosis?.areas.PLAN).toBe(70);
    expect(data.diagnosisPrevious?.PLAN).toBe(60);
    expect(data.diagnosisMeta).toEqual({
      schoolType: "일반고",
      gpa: "2.60등급(5등급제)",
      gradeTrend: null,
      diagnosedAt: "2026.03.10",
    });
  });

  test("one report has no previous, and no report or an unused service has neither", async () => {
    reports([
      {
        attempt_id: "a1",
        diagnosed_at: "2026-03-10T00:00:00Z",
        payload: payload(70),
      },
    ]);
    const one = await load(["diagnosis"]);
    expect(one.diagnosisPrevious).toBeNull();
    expect(one.diagnosisMeta).toEqual({
      schoolType: null,
      gpa: null,
      gradeTrend: null,
      diagnosedAt: null,
    });
    reports([]);
    const none = await load(["diagnosis"]);
    expect([none.diagnosisPrevious, none.diagnosisMeta]).toEqual([null, null]);
    const unused = await load([]);
    expect([unused.diagnosisPrevious, unused.diagnosisMeta]).toEqual([
      null,
      null,
    ]);
  });

  test("a v3 report is read through payload.scores and tagged v3, never matched by Korean labels", async () => {
    reports([
      {
        attempt_id: "a1",
        diagnosed_at: "2026-11-09T00:00:00Z",
        payload: v3Payload({ level: "L2" }),
      },
    ]);
    const data = await load(["diagnosis"]);
    expect(data.diagnosisAreas).toEqual({
      version: "v3",
      scores: v3Payload({ level: "L2" }).scores,
    });
    expect(data.metrics.diagnosis).toBeNull();
    expect(data.diagnosisPreviousAreas).toBeNull();
  });

  test("the previous diagnosis is compared only inside the same version", async () => {
    const v2 = (id: string, at: string) => ({
      attempt_id: id,
      diagnosed_at: at,
      payload: payload(60),
    });
    const v3 = (id: string, at: string, level: "L1" | "L4") => ({
      attempt_id: id,
      diagnosed_at: at,
      payload: v3Payload({ level }),
    });
    // v2 then v3: the v3 report has no comparable previous
    reports([
      v2("a1", "2026-10-01T00:00:00Z"),
      v3("a2", "2026-11-09T00:00:00Z", "L4"),
    ]);
    const mixed = await load(["diagnosis"]);
    expect(mixed.diagnosisAreas?.version).toBe("v3");
    expect(mixed.diagnosisPreviousAreas).toBeNull();
    expect(mixed.diagnosisPrevious).toBeNull();
    // v3 then v3: previous is the earlier v3 scores
    reports([
      v3("a1", "2026-10-01T00:00:00Z", "L1"),
      v3("a2", "2026-11-09T00:00:00Z", "L4"),
    ]);
    const same = await load(["diagnosis"]);
    expect(same.diagnosisPreviousAreas).toEqual({
      version: "v3",
      scores: v3Payload({ level: "L1" }).scores,
    });
    // v3 then v2 (latest is old): previous v3 is not shown beside a v2 latest
    reports([
      v3("a1", "2026-10-01T00:00:00Z", "L1"),
      v2("a2", "2026-11-09T00:00:00Z"),
    ]);
    const back = await load(["diagnosis"]);
    expect(back.diagnosisAreas?.version).toBe("v2");
    expect(back.diagnosisPreviousAreas).toBeNull();
    expect(back.diagnosisPrevious).toBeNull();
  });
});

describe("time zones", () => {
  // 서울은 11-11 05:00, 로스앤젤레스는 11-10 12:00 이다.
  const NOW = new Date("2026-11-10T20:00:00Z");
  const profile = (over: Record<string, unknown>) => {
    kit.rows.profiles = (f) =>
      matchRows([{ id: "s1", name: "김서연", ...over }], f);
  };
  const goal = () => {
    kit.rows.goal_students = (f) =>
      matchRows(
        [
          {
            profile_id: "s1",
            ideal_university: "",
            ideal_department: "",
            min_university: "",
            min_department: "",
            study_schedule: null,
            grade: "고1",
            naesin_scores: null,
            mock_exam_scores: null,
          },
        ],
        f,
      );
    kit.rows.goal_student_state = () => [];
    kit.rows.goal_daily_records = () => [
      {
        record_date: "2026-11-03",
        target_ideal_hours: 2,
        target_min_hours: 1,
        study_hours: 1,
        reasons: [],
      },
    ];
  };

  test("the goal week window follows the student's zone, not the viewer's", async () => {
    goal();
    profile({ time_zone: "America/Los_Angeles", last_seen_at: null });
    // 로스앤젤레스 학생의 창은 11-03~11-09 라서 11-03 기록이 든다.
    const la = await load(["goal"], "Asia/Seoul", NOW);
    expect(la.goalFacts?.week.setDays).toBe(1);
    profile({ time_zone: "Asia/Seoul", last_seen_at: null });
    // 서울 학생의 창은 11-04~11-10 이라 11-03 기록은 밖이다.
    const seoul = await load(["goal"], "America/Los_Angeles", NOW);
    expect(seoul.goalFacts?.week.setDays).toBe(0);
  });

  test("a goal student without a profile zone is an error, not a guessed zone", async () => {
    goal();
    kit.rows.profiles = () => [];
    await expect(load(["goal"], "Asia/Seoul", NOW)).rejects.toThrow(
      "student time zone missing",
    );
  });

  test("days since the last access are calendar days in the viewer's zone", async () => {
    goal();
    profile({
      time_zone: "Asia/Seoul",
      last_seen_at: "2026-11-02T14:59:59Z",
    });
    const now = new Date("2026-11-09T03:00:00Z");
    expect(
      (await load(["goal"], "Asia/Seoul", now)).goalFacts?.daysSinceLastSeen,
    ).toBe(7);
    expect(
      (await load(["goal"], "America/Los_Angeles", now)).goalFacts
        ?.daysSinceLastSeen,
    ).toBe(6);
  });
});
