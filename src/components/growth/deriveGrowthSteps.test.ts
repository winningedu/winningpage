import { describe, expect, test } from "vitest";
import {
  type DeriveGrowthStepsInput,
  deriveGrowthSteps,
} from "./deriveGrowthSteps";
import { GROWTH_PATHS } from "./growthPaths";

function open(
  overrides: Partial<NonNullable<DeriveGrowthStepsInput["openReport"]>> = {},
): NonNullable<DeriveGrowthStepsInput["openReport"]> {
  return {
    status: "draft",
    currentStep: 0,
    answered: 0,
    total: 24,
    ...overrides,
  };
}

function base(
  overrides: Partial<DeriveGrowthStepsInput> = {},
): DeriveGrowthStepsInput {
  return {
    screenStep: 1,
    openReport: null,
    latestCompletedReportId: null,
    ...overrides,
  };
}

const statuses = (input: DeriveGrowthStepsInput) =>
  deriveGrowthSteps(input).map((s) => s.status);

describe("deriveGrowthSteps 구성", () => {
  test("6단계를 시작, 학생 조사, 활동 선택, 리포트 생성, 리포트, 실행계획 순서로 돌려준다", () => {
    const steps = deriveGrowthSteps(base());
    expect(steps.map((s) => s.label)).toEqual([
      "시작",
      "학생 조사",
      "활동 선택",
      "리포트 생성",
      "리포트",
      "실행계획",
    ]);
    expect(steps.map((s) => s.key)).toEqual([
      "start",
      "survey",
      "collect",
      "generate",
      "report",
      "plan",
    ]);
  });
});

describe("회차가 없을 때", () => {
  test("시작이 현재이고 학생 조사만 열려 있다", () => {
    expect(statuses(base())).toEqual([
      "current",
      "upcoming",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("잠긴 단계는 이동 경로가 없다", () => {
    const steps = deriveGrowthSteps(base());
    expect(steps.map((s) => s.to)).toEqual([
      GROWTH_PATHS.home,
      GROWTH_PATHS.survey,
      null,
      null,
      null,
      null,
    ]);
  });

  test("완료 리포트가 있으면 리포트와 실행계획이 열린다", () => {
    const steps = deriveGrowthSteps(base({ latestCompletedReportId: "r9" }));
    expect(steps.map((s) => s.status)).toEqual([
      "current",
      "upcoming",
      "locked",
      "locked",
      "upcoming",
      "upcoming",
    ]);
    expect(steps[4]?.to).toBe(GROWTH_PATHS.report("r9"));
    expect(steps[5]?.to).toBe(GROWTH_PATHS.plan);
  });
});

describe("완료 뒤에만 다음 단계를 올린다", () => {
  test("설문을 다 채우기 전에는 활동 선택이 잠겨 있다", () => {
    const input = base({
      screenStep: 2,
      openReport: open({ answered: 23, total: 24 }),
    });
    expect(statuses(input)).toEqual([
      "done",
      "current",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("문항 수가 0이면 완료로 보지 않는다", () => {
    const input = base({
      screenStep: 2,
      openReport: open({ answered: 0, total: 0 }),
    });
    expect(deriveGrowthSteps(input)[2]?.status).toBe("locked");
  });

  test("설문을 다 채우면 활동 선택이 열리고 학생 조사는 완료다", () => {
    const input = base({
      screenStep: 1,
      openReport: open({ answered: 24, total: 24 }),
    });
    expect(statuses(input)).toEqual([
      "current",
      "done",
      "upcoming",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("활동 선택이 끝나 집계가 고정되면 리포트 생성이 열린다", () => {
    const input = base({
      screenStep: 3,
      openReport: open({
        status: "in_progress",
        currentStep: 1,
        answered: 24,
        total: 24,
      }),
    });
    expect(statuses(input)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "locked",
      "locked",
    ]);
  });

  test("리포트 생성 중에는 리포트가 아직 잠겨 있다", () => {
    const input = base({
      screenStep: 4,
      openReport: open({
        status: "in_progress",
        currentStep: 3,
        answered: 24,
        total: 24,
      }),
    });
    expect(statuses(input)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "locked",
      "locked",
    ]);
  });

  test("status 가 in_progress 면 currentStep 이 0이어도 활동 선택은 끝난 것으로 본다", () => {
    const input = base({
      screenStep: 1,
      openReport: open({ status: "in_progress", currentStep: 0 }),
    });
    expect(deriveGrowthSteps(input)[2]?.status).toBe("done");
  });
});

describe("완료 리포트를 보는 화면", () => {
  test("리포트 화면에서는 앞 네 단계가 완료이고 실행계획이 열려 있다", () => {
    const input = base({ screenStep: 5, latestCompletedReportId: "r9" });
    expect(statuses(input)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "upcoming",
    ]);
  });

  test("실행계획 화면에서는 리포트까지 완료다", () => {
    const input = base({ screenStep: 6, latestCompletedReportId: "r9" });
    expect(statuses(input)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  test("리포트 id 를 모르면 리포트 단계는 현재여도 경로가 없다", () => {
    const steps = deriveGrowthSteps(base({ screenStep: 5 }));
    expect(steps[4]).toMatchObject({ status: "current", to: null });
  });
});

describe("화면 단계가 없을 때", () => {
  test("지난 리포트 목록처럼 단계 밖 화면이면 현재 단계가 없다", () => {
    const steps = deriveGrowthSteps(base({ screenStep: null }));
    expect(steps.some((s) => s.status === "current")).toBe(false);
  });
});
