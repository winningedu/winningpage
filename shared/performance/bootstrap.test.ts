import { describe, expect, test } from "vitest";
import { bootstrapResponse, sessionSummarySchema } from "./bootstrap.js";

const SUMMARY = {
  sessionId: "s1",
  status: "in_progress",
  currentStep: 2,
  completedSteps: [1],
  lastCompletedStep: 1,
  resumeStep: 2,
  gradeLabel: "고1",
  semester: "1학기",
  schoolType: null,
  subjectGroup: "과학",
  subject: "물리",
  careerGoal: "연구원",
  previousTopic: null,
  guideInputMode: null,
  selectedTopicId: null,
  selectedTopicTitle: null,
  charged: false,
  hasDesignReport: false,
  hasEvaluationReport: false,
  hasFinalReport: false,
  createdAt: "2026-11-27T00:00:00Z",
  updatedAt: "2026-11-27T00:00:00Z",
};

const BASE = {
  profile: { id: "u1", name: null, schoolType: null, schoolName: null },
  entitlement: {
    serviceKey: "suhaeng",
    hasAccess: true,
    quotaTotal: null,
    quotaRemaining: null,
    planEndsAt: null,
    planLabel: null,
  },
  lastSession: null,
  latestDraft: null,
};

describe("bootstrapResponse", () => {
  test("세션이 없는 신규 진입 응답이 통과한다", () => {
    expect(bootstrapResponse.safeParse(BASE).success).toBe(true);
  });

  test("세션 요약이 있으면 모든 필드가 있어야 한다", () => {
    expect(
      bootstrapResponse.safeParse({ ...BASE, lastSession: SUMMARY }).success,
    ).toBe(true);
    expect(
      sessionSummarySchema.safeParse({ ...SUMMARY, resumeStep: undefined })
        .success,
    ).toBe(false);
  });

  test("이용권 필드가 빠지면 거절한다", () => {
    expect(
      bootstrapResponse.safeParse({ ...BASE, entitlement: { serviceKey: "x" } })
        .success,
    ).toBe(false);
  });
});
