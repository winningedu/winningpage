import { describe, expect, test } from "vitest";
import { INQUIRY_PATHS } from "./inquiryPaths";
import { type GuardSession, guardFor } from "./stepGuards";

function session(overrides: Partial<GuardSession> = {}): GuardSession {
  return {
    currentStep: 1,
    selectedTopicId: null,
    designReportId: null,
    latestEvaluationId: null,
    ...overrides,
  };
}

describe("세션이 없을 때", () => {
  test("모든 단계가 정보 입력으로 돌려보낸다", () => {
    for (const step of [3, 4, 5, 6] as const) {
      const guard = guardFor(step, null);
      expect(guard?.backTo).toBe(INQUIRY_PATHS.home);
      expect(guard?.backLabel).toBe("정보 입력으로 돌아가기");
    }
  });
});

describe("설계 리포트(3)", () => {
  test("설계 리포트가 없으면 주제 추천으로 돌려보낸다", () => {
    const guard = guardFor(3, session());
    expect(guard?.title).toBe("아직 설계 리포트가 없어요");
    expect(guard?.description).toBe(
      "주제 추천에서 주제를 하나 고르면 여기에 8절 설계가 나와요. 2단계 주제 추천으로 돌아가세요.",
    );
    expect(guard?.backTo).toBe(INQUIRY_PATHS.topics);
  });

  test("설계 리포트가 있으면 안내가 없다", () => {
    expect(guardFor(3, session({ designReportId: "d1" }))).toBeNull();
  });
});

describe("보고서 작성(4)", () => {
  test("주제도 못 골랐으면 주제 추천으로 보낸다", () => {
    expect(guardFor(4, session())?.backTo).toBe(INQUIRY_PATHS.topics);
  });

  test("주제는 골랐고 설계가 없으면 설계 리포트로 보낸다", () => {
    expect(guardFor(4, session({ selectedTopicId: "t1" }))?.backTo).toBe(
      INQUIRY_PATHS.design,
    );
  });

  test("설계 리포트가 있으면 안내가 없다", () => {
    expect(guardFor(4, session({ designReportId: "d1" }))).toBeNull();
  });
});

describe("평가 리포트(5)", () => {
  test("설계가 없으면 설계 리포트로 보낸다", () => {
    expect(guardFor(5, session({ selectedTopicId: "t1" }))?.backTo).toBe(
      INQUIRY_PATHS.design,
    );
  });

  test("설계는 있고 작성 단계에 못 갔으면 보고서 작성으로 보낸다", () => {
    const guard = guardFor(
      5,
      session({ designReportId: "d1", currentStep: 4 }),
    );
    expect(guard?.backTo).toBe(INQUIRY_PATHS.write);
  });

  test("작성본이 있어 5단계에 도달했으면 안내가 없다", () => {
    expect(
      guardFor(5, session({ designReportId: "d1", currentStep: 5 })),
    ).toBeNull();
  });

  test("평가 리포트가 있으면 안내가 없다", () => {
    expect(
      guardFor(5, session({ designReportId: "d1", latestEvaluationId: "e1" })),
    ).toBeNull();
  });
});

describe("확정(6)", () => {
  test("평가 리포트가 없으면 평가 리포트로 보낸다", () => {
    expect(guardFor(6, session({ designReportId: "d1" }))?.backTo).toBe(
      INQUIRY_PATHS.evaluate,
    );
  });

  test("평가 리포트가 있으면 안내가 없다", () => {
    expect(guardFor(6, session({ latestEvaluationId: "e1" }))).toBeNull();
  });
});
