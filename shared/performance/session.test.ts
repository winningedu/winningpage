import { describe, expect, test } from "vitest";
import {
  sessionBody,
  sessionDetailResponse,
  sessionQuery,
  sessionWriteResponse,
} from "./session.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";
const BASIC = {
  gradeLabel: "고1",
  semester: "1학기",
  subjectGroup: "과학",
  subject: "물리",
  careerGoal: "연구원",
};
const SESSION = {
  id: SID,
  status: "draft",
  currentStep: 1,
  completedSteps: [],
  gradeLabel: null,
  semester: null,
  schoolType: null,
  subjectGroup: null,
  subject: null,
  careerGoal: null,
  previousTopic: null,
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
};

describe("sessionQuery", () => {
  test("sessionId 가 uuid 여야 한다", () => {
    expect(sessionQuery.safeParse({ sessionId: SID }).success).toBe(true);
    expect(sessionQuery.safeParse({ sessionId: "x" }).success).toBe(false);
    expect(sessionQuery.safeParse({}).success).toBe(false);
  });
});

describe("sessionBody", () => {
  test("action 은 create 또는 resume 이다", () => {
    expect(sessionBody.safeParse({ action: "create" }).success).toBe(true);
    expect(
      sessionBody.safeParse({ action: "resume", basicInfo: null }).success,
    ).toBe(true);
    expect(sessionBody.safeParse({ action: "zzz" }).success).toBe(false);
  });

  test("basicInfo 는 필수 다섯 필드를 비우지 않아야 하고 모르는 키는 버린다", () => {
    const parsed = sessionBody.parse({
      action: "create",
      basicInfo: { ...BASIC, schoolType: "특목고" },
    });
    expect(parsed.basicInfo).toEqual(BASIC);
    expect(
      sessionBody.safeParse({
        action: "create",
        basicInfo: { ...BASIC, subject: " " },
      }).success,
    ).toBe(false);
  });
});

describe("세션 응답", () => {
  test("쓰기 응답은 세션과 quotaRemaining 을 가진다", () => {
    expect(
      sessionWriteResponse.safeParse({ session: SESSION, quotaRemaining: null })
        .success,
    ).toBe(true);
    expect(sessionWriteResponse.safeParse({ session: SESSION }).success).toBe(
      false,
    );
  });

  test("상세 응답은 재개 분기 재료를 가진다", () => {
    const detail = {
      session: {
        ...SESSION,
        guideInputMode: null,
        selectedTopicId: null,
        selectedTopicTitle: null,
      },
      topics: [],
      round: 0,
      maxRounds: 2,
    };
    expect(sessionDetailResponse.safeParse(detail).success).toBe(true);
    expect(
      sessionDetailResponse.safeParse({ ...detail, topics: [{}] }).success,
    ).toBe(false);
  });
});
