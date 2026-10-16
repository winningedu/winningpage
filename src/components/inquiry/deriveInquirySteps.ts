// 심화탐구 진행단계 6스텝 상태 유도(순수). 사이드바가 이 결과를 그대로 그린다(계약: 부록 C).
//
// done 규칙: 세션이 있으면 1, selectedTopicId 가 있으면 2, designReportId 가 있으면 3,
//   currentStep 이 5 이상이거나 latestEvaluationId 가 있으면 4, latestEvaluationId 가 있으면 5,
//   status 가 completed 면 6.
// 상태: current(지금 화면, 다른 판정보다 우선), done, upcoming(앞 단계가 done 이라 들어갈 수 있음),
//   locked(앞 단계가 done 이 아님, to 는 null).

import { STEP_NAMES } from "@/lib/inquiry/labels";
import type { ScreenStep, SessionStatus } from "@/lib/inquiry/types";
import { INQUIRY_PATHS } from "./inquiryPaths";

export type InquiryScreenStep = ScreenStep;

export type InquiryStepKey =
  | "info"
  | "topics"
  | "design"
  | "write"
  | "evaluate"
  | "finalize";

export type InquiryStepStatus = "done" | "current" | "upcoming" | "locked";

export type InquiryStep = {
  key: InquiryStepKey;
  label: string;
  status: InquiryStepStatus;
  /** 이동 경로. 잠겼으면 null. */
  to: string | null;
};

export type DeriveInquiryStepsInput = {
  /** 지금 화면의 단계. 보관함처럼 단계 밖 화면이면 null. */
  screenStep: InquiryScreenStep | null;
  session: {
    status: SessionStatus;
    currentStep: number;
    selectedTopicId: string | null;
    designReportId: string | null;
    latestEvaluationId: string | null;
  } | null;
};

const STEP_KEYS: readonly InquiryStepKey[] = [
  "info",
  "topics",
  "design",
  "write",
  "evaluate",
  "finalize",
];

const STEP_TO: readonly string[] = [
  INQUIRY_PATHS.home,
  INQUIRY_PATHS.topics,
  INQUIRY_PATHS.design,
  INQUIRY_PATHS.write,
  INQUIRY_PATHS.evaluate,
  INQUIRY_PATHS.finalize,
];

function doneFlags(session: DeriveInquiryStepsInput["session"]): boolean[] {
  if (!session) return [false, false, false, false, false, false];
  const hasEvaluation = session.latestEvaluationId !== null;
  return [
    true,
    session.selectedTopicId !== null,
    session.designReportId !== null,
    session.currentStep >= 5 || hasEvaluation,
    hasEvaluation,
    session.status === "completed",
  ];
}

export function deriveInquirySteps({
  screenStep,
  session,
}: DeriveInquiryStepsInput): InquiryStep[] {
  const done = doneFlags(session);
  return STEP_KEYS.map((key, index): InquiryStep => {
    const step = index + 1;
    const label = STEP_NAMES[index] as string;
    const to = STEP_TO[index] as string;
    if (step === screenStep) return { key, label, status: "current", to };
    if (done[index]) return { key, label, status: "done", to };
    const unlocked = index === 0 || done[index - 1] === true;
    return unlocked
      ? { key, label, status: "upcoming", to }
      : { key, label, status: "locked", to: null };
  });
}
