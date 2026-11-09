// 코칭 자료 읽기(W9). 문구와 상세 창이 쓸 서비스 상태 사실이 서비스 테이블에서 바르게 읽히는지 본다.

import { beforeEach, describe, expect, test } from "vitest";
import { loadCoachingData } from "./coachingData.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "./consoleTestKit.js";

let kit: KitState;

const load = (used: Parameters<typeof loadCoachingData>[2]) =>
  loadCoachingData(createFakeAdmin(kit) as never, "s1", used);

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
});
