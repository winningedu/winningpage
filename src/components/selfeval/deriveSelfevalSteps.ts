// 자기평가서 진행단계 6스텝 상태 유도(순수). 사이드바가 이 결과를 그대로 그린다.
// 성장설계 deriveGrowthSteps 와 같은 원칙이다: 완료된 뒤에만 다음 단계를 올린다.
//
// 단계: 1 시작, 2 기본 입력, 3 활동 선택, 4 분석 확인, 5 생성 결과, 6 검증과 저장.
//
// 상태 4가지
//   current   지금 보고 있는 화면의 단계(screenStep). 다른 판정보다 우선한다.
//   done      열린 세션에서 끝난 단계.
//   upcoming  아직 끝나지 않았지만 지금 들어갈 수 있는 단계(끝난 마지막 단계의 바로 다음).
//   locked    앞 단계가 끝나지 않아 들어갈 수 없는 단계. 이동 경로 `to` 가 null 이다.
//
// 세션 current_step(0~6) 에서 끝난 단계를 읽는 규칙
//   current_step >= 1 이면 시작과 기본 입력이 끝났다(세션 생성이 곧 기본 입력 저장이다).
//   >= 2 활동 선택, >= 3 분석 확인, >= 4 생성 결과, 6 이면 검증과 저장이 끝났다.
//   5(검증 완료, 저장 전)는 검증과 저장 단계가 아직 진행 중이다.

import { SELFEVAL_PATHS, type SelfevalStep } from "./selfevalPaths";

export type SelfevalStepKey =
  | "start"
  | "basics"
  | "activities"
  | "analysis"
  | "result"
  | "verify";

export type SelfevalStepStatus = "done" | "current" | "upcoming" | "locked";

export type SelfevalStepItem = {
  key: SelfevalStepKey;
  label: string;
  status: SelfevalStepStatus;
  /** 이동 경로. 잠겼거나 세션이 없어 경로를 모르면 null. */
  to: string | null;
};

export type SelfevalScreenStep = 1 | 2 | 3 | 4 | 5 | 6;

export type DeriveSelfevalStepsInput = {
  /** 지금 화면의 단계. 보관함처럼 단계 밖 화면이면 null. */
  screenStep: SelfevalScreenStep | null;
  /** 열린(draft, in_progress) 세션. 없으면 null. */
  openSession: { id: string; currentStep: SelfevalStep } | null;
};

const STEP_DEFS: readonly { key: SelfevalStepKey; label: string }[] = [
  { key: "start", label: "시작" },
  { key: "basics", label: "기본 입력" },
  { key: "activities", label: "활동 선택" },
  { key: "analysis", label: "분석 확인" },
  { key: "result", label: "생성 결과" },
  { key: "verify", label: "검증과 저장" },
];

/** 세션 단계에서 "끝난 마지막 화면 단계 번호"(0~6)를 읽는다. */
function completedThrough(session: DeriveSelfevalStepsInput["openSession"]) {
  if (!session) return 0;
  const step = session.currentStep;
  if (step >= 6) return 6;
  if (step >= 4) return 5;
  if (step >= 3) return 4;
  if (step >= 2) return 3;
  if (step >= 1) return 2;
  return 1;
}

function pathOf(
  key: SelfevalStepKey,
  session: DeriveSelfevalStepsInput["openSession"],
): string | null {
  if (key === "start") return SELFEVAL_PATHS.home;
  if (key === "basics") {
    return session
      ? `${SELFEVAL_PATHS.new}?sessionId=${encodeURIComponent(session.id)}`
      : SELFEVAL_PATHS.new;
  }
  if (!session) return null;
  switch (key) {
    case "activities":
      return SELFEVAL_PATHS.activities(session.id);
    case "analysis":
      return SELFEVAL_PATHS.analysis(session.id);
    case "result":
      return SELFEVAL_PATHS.result(session.id);
    case "verify":
      return SELFEVAL_PATHS.verify(session.id);
  }
}

export function deriveSelfevalSteps(
  input: DeriveSelfevalStepsInput,
): SelfevalStepItem[] {
  // 열린 세션이 없는데 생성 결과나 저장 완료 화면이면 완료 세션을 다시 보는 것이다.
  // 그 앞 단계는 끝난 것으로 본다(성장설계 deriveGrowthSteps 와 같은 규칙).
  const viewingFinished =
    input.openSession === null &&
    (input.screenStep === 5 || input.screenStep === 6);
  const through = viewingFinished
    ? (input.screenStep as number) - 1
    : completedThrough(input.openSession);
  // 세션 단계 0 은 기본 입력이 아직 끝나지 않았다. 그 세션의 이어하기 경로를 쓴다.
  const session = input.openSession;
  return STEP_DEFS.map(({ key, label }, index): SelfevalStepItem => {
    const step = index + 1;
    const to = pathOf(key, session);
    if (step === input.screenStep) {
      return { key, label, status: "current", to };
    }
    if (step <= through) {
      return { key, label, status: "done", to };
    }
    // 시작과 기본 입력은 세션이 없어도 들어갈 수 있다. 그 뒤는 끝난 단계의 바로 다음만 열린다.
    const reachable = step <= 2 || (session !== null && step <= through + 1);
    return reachable
      ? { key, label, status: "upcoming", to }
      : { key, label, status: "locked", to: null };
  });
}
