// 성장설계 진행단계 6스텝 상태 유도(순수). 사이드바가 이 결과를 그대로 그린다.
// 수행평가 deriveStepStates.ts 와 같은 원칙이다: **완료된 뒤에만 다음 단계를 올린다.**
// 비동기 작업을 시작하는 순간 다음 단계를 켜지 않는다.
//
// 단계: 1 시작, 2 학생 조사, 3 활동 선택, 4 리포트 생성, 5 리포트, 6 실행계획.
//
// 상태 4가지
//   current   지금 보고 있는 화면의 단계(screenStep). 다른 판정보다 우선한다.
//   done      진행 중 회차에서 끝난 단계, 또는 완료 리포트를 보는 화면의 앞 단계.
//   upcoming  아직 끝나지 않았지만 지금 들어갈 수 있는 단계.
//   locked    앞 단계가 끝나지 않아 들어갈 수 없는 단계. 이동 경로 `to` 가 null 이다.
//
// 진행 중 회차(openReport)에서 끝난 단계를 읽는 규칙
//   회차가 있으면 시작은 끝났다(1).
//   설문을 모두 답했으면(answered >= total, total > 0) 학생 조사가 끝났다(2).
//   리포트 생성이 시작됐으면(status in_progress 또는 currentStep > 0) 활동 선택이 끝났다(3).
//     생성이 시작되려면 활동 집계가 회차에 고정돼야 하기 때문이다(collect commit).
//   리포트 생성(4)이 끝나면 회차가 completed 가 돼 openReport 에서 빠진다. 그래서 4 이후는
//   "완료 리포트를 보는 화면(screenStep 5, 6)"에서만 done 이 된다.

import { GROWTH_PATHS } from "./growthPaths";

export type GrowthStepKey =
  | "start"
  | "survey"
  | "collect"
  | "generate"
  | "report"
  | "plan";

export type GrowthStepStatus = "done" | "current" | "upcoming" | "locked";

export type GrowthStep = {
  key: GrowthStepKey;
  label: string;
  status: GrowthStepStatus;
  /** 이동 경로. 잠겼거나 경로를 아직 모르면 null. */
  to: string | null;
};

export type GrowthScreenStep = 1 | 2 | 3 | 4 | 5 | 6;

export type DeriveGrowthStepsInput = {
  /** 지금 화면의 단계. 지난 리포트 목록처럼 단계 밖 화면이면 null. */
  screenStep: GrowthScreenStep | null;
  /** 진행 중(draft, in_progress) 회차. 없으면 null. */
  openReport: {
    status: "draft" | "in_progress";
    currentStep: number;
    answered: number;
    total: number;
  } | null;
  /** 가장 최근 완료 리포트 id. 완료 리포트가 없으면 null. */
  latestCompletedReportId: string | null;
};

const STEP_DEFS: readonly { key: GrowthStepKey; label: string }[] = [
  { key: "start", label: "시작" },
  { key: "survey", label: "학생 조사" },
  { key: "collect", label: "활동 선택" },
  { key: "generate", label: "리포트 생성" },
  { key: "report", label: "리포트" },
  { key: "plan", label: "실행계획" },
];

/** 진행 중 회차와 화면 단계에서 "끝난 마지막 단계 번호"(0~5)를 읽는다. */
function completedThrough({
  screenStep,
  openReport,
}: DeriveGrowthStepsInput): number {
  let done = 0;
  if (openReport) {
    done = 1;
    if (openReport.total > 0 && openReport.answered >= openReport.total) {
      done = 2;
    }
    if (openReport.status === "in_progress" || openReport.currentStep > 0) {
      done = 3;
    }
  }
  // 완료 리포트를 보고 있다면 리포트 생성까지 끝난 것이다.
  if (screenStep === 5) done = Math.max(done, 4);
  if (screenStep === 6) done = Math.max(done, 5);
  return done;
}

function pathOf(
  key: GrowthStepKey,
  latestCompletedReportId: string | null,
): string | null {
  switch (key) {
    case "start":
      return GROWTH_PATHS.home;
    case "survey":
      return GROWTH_PATHS.survey;
    case "collect":
      return GROWTH_PATHS.collect;
    case "generate":
      return GROWTH_PATHS.generate;
    case "report":
      return latestCompletedReportId
        ? GROWTH_PATHS.report(latestCompletedReportId)
        : null;
    case "plan":
      return GROWTH_PATHS.plan;
  }
}

export function deriveGrowthSteps(input: DeriveGrowthStepsInput): GrowthStep[] {
  const through = completedThrough(input);
  const hasCompletedReport = input.latestCompletedReportId !== null;

  return STEP_DEFS.map(({ key, label }, index): GrowthStep => {
    const step = index + 1;
    const to = pathOf(key, input.latestCompletedReportId);

    if (step === input.screenStep) {
      return { key, label, status: "current", to };
    }
    if (step <= through) {
      return { key, label, status: "done", to };
    }
    // 시작과 학생 조사는 회차가 없어도 들어갈 수 있다(조사 화면이 첫 저장 때 회차를 만든다).
    // 활동 선택과 리포트 생성은 바로 앞 단계가 끝나야 열린다.
    const reachable =
      step <= 2 ||
      (step <= 4 && step <= through + 1) ||
      (step >= 5 && hasCompletedReport);
    return reachable
      ? { key, label, status: "upcoming", to }
      : { key, label, status: "locked", to: null };
  });
}
