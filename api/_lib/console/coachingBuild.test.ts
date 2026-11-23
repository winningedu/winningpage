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
import { v3Payload } from "./diagnosisV3TestKit.js";

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

const withDiagnosis = (payload: unknown) => {
  kit.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "s1" }], f);
  kit.rows.diagnosis_reports = (f) =>
    matchRows(
      [
        {
          attempt_id: "d1",
          profile_id: "s1",
          diagnosed_at: "2026-11-09T00:00:00Z",
          payload,
          snapshot: null,
        },
      ],
      f,
    );
};

const learningOf = async () =>
  (
    await buildCoaching(
      createFakeAdmin(kit) as never,
      "s1",
      ["diagnosis"],
      "고1",
    )
  ).verdicts.learning;

// 코칭 판정 문구표 r9~r12: 긴급도 높음 이상이면 위험, 실행 역량 50 미만이면 위험, 75 이상이면 양호, 그 밖은 주의.
test("a v3 student's learning verdict is risk when the stored urgency step is very high", async () => {
  withDiagnosis(v3Payload({ level: "L4", total1: 80 }));
  expect(await learningOf()).toEqual({ level: "risk" });
});

test.each([
  { level: "L1", total1: 75, expected: { level: "good" } },
  { level: "L2", total1: 62, expected: { level: "caution" } },
  { level: "L1", total1: 49, expected: { level: "risk" } },
  { level: "L3", total1: 80, expected: { level: "risk" } },
] as const)(
  "a v3 student with $level and page 1 total $total1 has learning $expected.level",
  async ({ level, total1, expected }) => {
    withDiagnosis(v3Payload({ level, total1 }));
    expect(await learningOf()).toEqual(expected);
  },
);

// B1: a v3 student must not be treated as "not diagnosed" by the text, the indicators or the competencies.
const resultOf = async (
  services: readonly ("diagnosis" | "goal")[] = ["diagnosis"],
) => buildCoaching(createFakeAdmin(kit) as never, "s1", [...services], "고1");

test("a v3 student's text never says to take the diagnosis", async () => {
  withDiagnosis(v3Payload({ level: "L4", total1: 80 }));
  const { text } = await resultOf();
  const all = JSON.stringify(text);
  expect(all).not.toContain("학습진단을 응시");
  expect(all).not.toContain("학습진단 미실시");
});

test("a v3 student's diagnosis card shows the stored urgency, both page totals and the lowest page 1 area", async () => {
  withDiagnosis(v3Payload({ level: "L4", total1: 80, total2: 63.1 }));
  const card = (await resultOf()).text.serviceCards.find(
    (c) => c.service === "diagnosis",
  );
  // P1_EXEC is the lowest page 1 area (40) in the fixture
  expect(card?.value).toBe("긴급도 매우 높음");
  expect(card?.detail).toContain("학습 실행 역량 80점, 학교생활 준비도 63점");
  expect(card?.detail).toContain("가장 시급한 영역");
  expect(card?.detail).toContain("(40점)");
});

test("a v3 student's execution indicator is the page 1 total and feeds axis 1 and the academic competency", async () => {
  withDiagnosis(v3Payload({ total1: 62.3 }));
  const result = await resultOf();
  const axis = result.axesResult.axes.find((a) => a.key === "execution");
  expect(axis?.score).toBe(62);
  expect(
    result.competencies.find((c) => c.key === "academic")?.score,
  ).not.toBeNull();
});

test("a v3 student's weaknesses name the lowest page 1 area with its state and a first step from the sheet", async () => {
  withDiagnosis(v3Payload({ level: "L2", total1: 62 }));
  const { text } = await resultOf();
  expect(text.weaknesses.join("\n")).toContain("40점");
  expect(JSON.stringify(text.studyMethods)).not.toContain("학습진단을 응시");
});
