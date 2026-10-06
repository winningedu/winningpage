// 선행 조건 미충족 안내(No.113, 114) 판정(순수). 각 단계 화면이 StepGuardCard 에 넘길 props 를 돌려준다.
// null 이면 선행 조건이 충족돼 본문을 그려도 된다. 판정 기준은 계획서 §2 28:
// 작성은 설계 리포트, 평가는 평가 리포트 또는 작성본(currentStep 5 이상), 확정은 평가 리포트가 있어야 한다.
import { INQUIRY_PATHS } from "./inquiryPaths";

export type GuardSession = {
  currentStep: number;
  selectedTopicId: string | null;
  designReportId: string | null;
  latestEvaluationId: string | null;
};

export type StepGuard = {
  title: string;
  description: string;
  backLabel: string;
  backTo: string;
};

export type GuardedStep = 3 | 4 | 5 | 6;

const NO_SESSION: StepGuard = {
  title: "아직 시작한 세션이 없어요",
  description:
    "정보를 입력하고 주제 추천을 받으면 이 단계가 열려요. 1단계 정보 입력으로 돌아가세요.",
  backLabel: "정보 입력으로 돌아가기",
  backTo: INQUIRY_PATHS.home,
};

const BACK_TOPICS = {
  backLabel: "주제 추천으로 돌아가기",
  backTo: INQUIRY_PATHS.topics,
};
const BACK_DESIGN = {
  backLabel: "설계 리포트로 돌아가기",
  backTo: INQUIRY_PATHS.design,
};

/** 설계 리포트가 없을 때 돌아갈 곳. 주제를 못 골랐으면 주제 추천, 골랐으면 설계 리포트. */
function backToDesignSource(session: GuardSession) {
  return session.selectedTopicId === null ? BACK_TOPICS : BACK_DESIGN;
}

export function guardFor(
  step: GuardedStep,
  session: GuardSession | null,
): StepGuard | null {
  if (!session) return NO_SESSION;

  switch (step) {
    case 3:
      return session.designReportId !== null
        ? null
        : {
            title: "아직 설계 리포트가 없어요",
            description:
              "주제 추천에서 주제를 하나 고르면 여기에 8절 설계가 나와요. 2단계 주제 추천으로 돌아가세요.",
            ...BACK_TOPICS,
          };
    case 4:
      return session.designReportId !== null
        ? null
        : {
            title: "아직 보고서를 쓸 수 없어요",
            description:
              "설계 리포트가 만들어지면 8절 작성 화면이 열려요. 앞 단계로 돌아가 주제를 정하고 설계를 받아 보세요.",
            ...backToDesignSource(session),
          };
    case 5: {
      if (session.designReportId === null) {
        return {
          title: "아직 평가할 보고서가 없어요",
          description:
            "설계 리포트를 받고 보고서를 작성하면 여기에 평가 리포트가 나와요. 앞 단계로 돌아가세요.",
          ...backToDesignSource(session),
        };
      }
      if (session.latestEvaluationId === null && session.currentStep < 5) {
        return {
          title: "아직 평가할 보고서가 없어요",
          description:
            "보고서를 작성해 저장하면 여기에 평가 리포트가 나와요. 4단계 보고서 작성으로 돌아가세요.",
          backLabel: "보고서 작성으로 돌아가기",
          backTo: INQUIRY_PATHS.write,
        };
      }
      return null;
    }
    case 6:
      return session.latestEvaluationId !== null
        ? null
        : {
            title: "아직 확정할 평가가 없어요",
            description:
              "평가 리포트가 나오면 여기에서 내용을 확인하고 활동 기록으로 적립해요. 5단계 평가 리포트로 돌아가세요.",
            backLabel: "평가 리포트로 돌아가기",
            backTo: INQUIRY_PATHS.evaluate,
          };
  }
}
