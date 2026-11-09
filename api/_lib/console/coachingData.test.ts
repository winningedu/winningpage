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
