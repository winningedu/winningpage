// 설계 리포트 화면과 테스트가 같이 쓰는 DesignView 표본(테스트 전용 데이터).
import { SECTIONS } from "@/lib/inquiry/submission";
import type { DesignView, SectionId } from "@/lib/inquiry/types";

const ROLE = (id: SectionId) => `${id}절의 역할`;

export function makeDesign(over: Partial<DesignView> = {}): DesignView {
  return {
    verifiability: "공개 통계로 직접 검증할 수 있어요.",
    sections: SECTIONS.map((s) => ({
      id: s.id,
      role: ROLE(s.id),
      must: [`${s.id} 필수 1`, `${s.id} 필수 2`],
      avoid: [`${s.id} 금지 1`],
      tip: `${s.id} 작성 요령`,
    })),
    sourceTable: [
      { item: "폭염일수", source: "확인 필요", asOf: "확인 필요" },
      { item: "가축 폐사수", source: "확인 필요", asOf: "확인 필요" },
    ],
    searchPlan: [
      {
        keyword: "가축 폐사",
        institution: "농림축산식품부",
        item: "연도별 폐사수",
      },
    ],
    interpretQuestions: {
      same: "다른 축종에서도 같은가?",
      different: "빠진 변수는 무엇인가?",
      insufficient: "어떤 범위까지 말할 수 있는가?",
    },
    scope: { minimum: ["공개 통계 2종"], optional: ["축종별 비교"] },
    overview: {
      topicTitle: "폭염과 가축 폐사",
      subtitle: "기상 지표의 예측력",
      linkKindLabel: "비판형",
      startActivity: "여름철 산책 판단 기준 탐구",
      startGap: "지수가 무엇을 측정하는지 확인하지 않음",
      question: "종별 기준이 실제 피해를 잘 예측하는가?",
      hypothesis1: "폭염일수가 많을수록 폐사율이 높다",
      hypothesis2: "가설 1이 지지되지 않으면 다른 변수가 있다",
      fit: "match",
      fitLabel: "맞음",
      fitReason: null,
      stageLabel: "고2 꽃 단계",
      planItemTitle: null,
    },
    reliability: "A",
    reliabilityNotice: null,
    lengths: SECTIONS.map((s) => ({ ...s })),
    checklist: [
      {
        id: "c1",
        text: "출발 활동 이름이 나오는가",
        rubric: "linkage",
        section: "I",
        guidanceOnly: false,
      },
      {
        id: "c11",
        text: "진로 연결을 직무로 쓰는가",
        rubric: null,
        section: "V",
        guidanceOnly: true,
      },
    ],
    rubricPreview: [
      { id: "linkage", label: "기존 활동과의 연계 및 탐구 동기", maxScore: 20 },
      { id: "question", label: "질문의 구체성과 심화", maxScore: 20 },
    ],
    forbidden: ["확인하지 않은 수치 인용", "상관을 인과로 바꿔 쓰기"],
    ...over,
  };
}
