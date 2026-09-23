// POST /api/goal/intake-update 순수 검증 함수 회귀 테스트.
// intake.naesinMogo.test.ts와 같은 규약 — handler I/O(supabase 조회·upsert)는
// 로컬 스택 QA로, 분리 가능한 순수 함수만 여기서 검증한다.
import { describe, expect, it } from "vitest";
import { ensureOwnProfile, validateIntakeUpdateBody } from "./intake-update.js";

describe("ensureOwnProfile", () => {
  it("body에 profileId가 없으면 통과시킨다(세션 본인 것만 쓰는 정상 경로)", () => {
    const result = ensureOwnProfile(undefined, "session-user-1");
    expect(result.error).toBeUndefined();
  });

  it("body의 profileId가 세션 본인과 같으면 통과시킨다", () => {
    const result = ensureOwnProfile("session-user-1", "session-user-1");
    expect(result.error).toBeUndefined();
  });

  it("body의 profileId가 세션 본인과 다르면 403을 낸다", () => {
    const result = ensureOwnProfile("other-user-2", "session-user-1");
    expect(result.error?.status).toBe(403);
  });
});

describe("validateIntakeUpdateBody — section", () => {
  it("section이 없으면 400", () => {
    const result = validateIntakeUpdateBody({}, "고3");
    expect(result.error?.status).toBe(400);
  });

  it("section이 알 수 없는 값이면 400", () => {
    const result = validateIntakeUpdateBody({ section: "weird" }, "고3");
    expect(result.error?.status).toBe(400);
  });
});

describe("validateIntakeUpdateBody — target", () => {
  it("정상 입력이면 ideal/min을 채워 돌려준다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "target",
        upperUniversity: { university: "서울대", department: "경영학과" },
        lowerUniversity: { university: "연세대", department: "경영학과" },
      },
      "고3",
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      section: "target",
      ideal: { university: "서울대", department: "경영학과" },
      min: { university: "연세대", department: "경영학과" },
    });
  });

  it("upperUniversity에 대학이 없으면 validateTarget의 400을 그대로 낸다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "target",
        upperUniversity: { university: "", department: "" },
        lowerUniversity: { university: "연세대", department: "경영학과" },
      },
      "고3",
    );
    expect(result.error?.status).toBe(400);
  });
});

describe("validateIntakeUpdateBody — naesin", () => {
  it("정상 입력이면 section:'naesin'과 파생 필드를 돌려준다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "naesin",
        naesin: {
          lastExam: "g3_s1mid",
          overall: "2",
          priorNaesinGrade: "",
          exams: {},
        },
      },
      "고3",
    );
    expect(result.error).toBeUndefined();
    if (result.value?.section !== "naesin") throw new Error("expected naesin");
    expect(result.value.naesinOverall).toBe("2");
    expect(result.value.naesinAllNone).toBe(false);
  });

  it("등급이 범위를 벗어나면 validateNaesinInput의 400을 그대로 낸다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "naesin",
        naesin: {
          lastExam: "g3_s1mid",
          overall: "10",
          priorNaesinGrade: "",
          exams: {},
        },
      },
      "고3",
    );
    expect(result.error?.status).toBe(400);
  });
});

describe("validateIntakeUpdateBody — mock", () => {
  it("정상 입력이면 section:'mock'과 파생 필드를 돌려준다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "mock",
        mockExam: { lastRound: "", track: "", rounds: {} },
      },
      "고3",
    );
    expect(result.error).toBeUndefined();
    if (result.value?.section !== "mock") throw new Error("expected mock");
    expect(result.value.mockAllNone).toBe(true);
  });

  it("탐구 선택 과목이 없으면 validateMockExamInput의 400을 그대로 낸다", () => {
    const result = validateIntakeUpdateBody(
      {
        section: "mock",
        mockExam: { lastRound: "g3_mar", track: "", rounds: {} },
      },
      "고3",
    );
    expect(result.error?.status).toBe(400);
  });
});
