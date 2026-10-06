import { describe, expect, test } from "vitest";
import {
  type DeriveInquiryStepsInput,
  deriveInquirySteps,
} from "./deriveInquirySteps";
import { INQUIRY_PATHS } from "./inquiryPaths";

type S = NonNullable<DeriveInquiryStepsInput["session"]>;

function session(overrides: Partial<S> = {}): S {
  return {
    status: "draft",
    currentStep: 1,
    selectedTopicId: null,
    designReportId: null,
    latestEvaluationId: null,
    ...overrides,
  };
}

const statuses = (input: DeriveInquiryStepsInput) =>
  deriveInquirySteps(input).map((s) => s.status);

describe("구성", () => {
  test("6단계 키와 라벨과 경로가 순서대로 나온다", () => {
    const steps = deriveInquirySteps({
      screenStep: 1,
      session: session({
        status: "completed",
        currentStep: 6,
        selectedTopicId: "t1",
        designReportId: "d1",
        latestEvaluationId: "e1",
      }),
    });
    expect(steps.map((s) => s.key)).toEqual([
      "info",
      "topics",
      "design",
      "write",
      "evaluate",
      "finalize",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "정보 입력",
      "주제 추천",
      "설계 리포트",
      "보고서 작성",
      "평가 리포트",
      "확정과 적립",
    ]);
    expect(steps.map((s) => s.to)).toEqual([
      INQUIRY_PATHS.home,
      INQUIRY_PATHS.topics,
      INQUIRY_PATHS.design,
      INQUIRY_PATHS.write,
      INQUIRY_PATHS.evaluate,
      INQUIRY_PATHS.finalize,
    ]);
  });
});

describe("세션이 없을 때", () => {
  test("정보 입력만 열려 있고 나머지는 잠긴다", () => {
    expect(statuses({ screenStep: 1, session: null })).toEqual([
      "current",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("잠긴 단계는 이동 경로가 null 이다", () => {
    const steps = deriveInquirySteps({ screenStep: 1, session: null });
    expect(steps.slice(1).every((s) => s.to === null)).toBe(true);
  });
});

describe("진행 중 세션", () => {
  test("세션이 있으면 정보 입력이 끝나고 주제 추천이 열린다", () => {
    expect(statuses({ screenStep: null, session: session() })).toEqual([
      "done",
      "upcoming",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("주제를 고르면 설계 리포트가 열린다", () => {
    expect(
      statuses({
        screenStep: 2,
        session: session({ selectedTopicId: "t1" }),
      }),
    ).toEqual(["done", "current", "upcoming", "locked", "locked", "locked"]);
  });

  test("설계 리포트가 있으면 보고서 작성이 열린다", () => {
    expect(
      statuses({
        screenStep: 3,
        session: session({ selectedTopicId: "t1", designReportId: "d1" }),
      }),
    ).toEqual(["done", "done", "current", "upcoming", "locked", "locked"]);
  });

  test("현재 단계는 잠금보다 우선한다", () => {
    expect(statuses({ screenStep: 4, session: session() })[3]).toBe("current");
  });

  test("session.currentStep 이 5 이상이면 보고서 작성이 끝난다", () => {
    expect(
      statuses({
        screenStep: null,
        session: session({
          currentStep: 5,
          selectedTopicId: "t1",
          designReportId: "d1",
        }),
      }),
    ).toEqual(["done", "done", "done", "done", "upcoming", "locked"]);
  });

  test("평가 리포트가 있으면 평가 단계까지 끝나고 확정이 열린다", () => {
    expect(
      statuses({
        screenStep: null,
        session: session({
          currentStep: 5,
          selectedTopicId: "t1",
          designReportId: "d1",
          latestEvaluationId: "e1",
        }),
      }),
    ).toEqual(["done", "done", "done", "done", "done", "upcoming"]);
  });

  test("확정된 세션은 6단계 모두 끝난다", () => {
    expect(
      statuses({
        screenStep: null,
        session: session({
          status: "completed",
          currentStep: 6,
          selectedTopicId: "t1",
          designReportId: "d1",
          latestEvaluationId: "e1",
        }),
      }),
    ).toEqual(["done", "done", "done", "done", "done", "done"]);
  });
});
