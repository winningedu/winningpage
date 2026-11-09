// 코칭 한 벌 조립(W9). 자료 읽기에서 나온 서비스 상태 사실이 문구 입력(TextFacts)까지 넘어가는지 본다.

import { beforeEach, expect, test, vi } from "vitest";
import type { TextFacts } from "./coachingText.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "./consoleTestKit.js";

const seen = vi.hoisted(() => ({ facts: null as unknown as TextFacts }));

vi.mock("./coachingText.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coachingText.js")>();
  return {
    ...actual,
    buildCoachingText: (facts: TextFacts) => {
      seen.facts = facts;
      return actual.buildCoachingText(facts);
    },
  };
});

import { buildCoaching } from "./coachingBuild.js";

let kit: KitState;

beforeEach(() => {
  kit = createKitState();
  kit.rows.profiles = () => [];
  kit.rows.goal_students = (f) =>
    matchRows(
      [
        {
          profile_id: "s1",
          ideal_university: "가나대",
          ideal_department: "경영학과",
          min_university: "",
          min_department: "",
        },
      ],
      f,
    );
  kit.rows.goal_daily_records = () => [];
  kit.rows.goal_student_state = (f) =>
    matchRows([{ profile_id: "s1", ideal_susi: 33.6, min_susi: null }], f);
  kit.rows.inquiry_sessions = (f) =>
    matchRows(
      [
        {
          profile_id: "s1",
          updated_at: "2026-11-05",
          current_step: 3,
          status: "in_progress",
          selected_topic_id: null,
          latest_evaluation_id: null,
        },
      ],
      f,
    );
  kit.rows.inquiry_reports = () => [];
  kit.rows.selfeval_sessions = (f) =>
    matchRows(
      [
        {
          profile_id: "s1",
          updated_at: "2026-11-05",
          current_step: 1,
          status: "in_progress",
        },
      ],
      f,
    );
  kit.rows.selfeval_reports = () => [];
});

test("the inquiry stage, the self-assessment stage and the targets with probability reach the text facts", async () => {
  await buildCoaching(
    createFakeAdmin(kit) as never,
    "s1",
    ["goal", "inquiry", "selfeval"],
    "고1",
  );
  expect(seen.facts.inquiryStage).toEqual({
    step: 3,
    name: "설계 리포트",
    completed: false,
  });
  expect(seen.facts.selfevalStage).toEqual({
    step: 1,
    name: "활동 선택",
    finished: false,
  });
  expect(seen.facts.targets).toEqual({
    ideal: { university: "가나대", department: "경영학과", probability: 34 },
    min: null,
  });
});
