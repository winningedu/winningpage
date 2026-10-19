// 리포트 표지 문구 프리셋 - QA3 시트 행55, 56. 리포트 종류별 표지 문구 정본.
// 항목 필터링(예: inquiryFinal 의 "최종 본문")은 호출부 몫이고 프리셋은 그대로 둔다.
import { site } from "@/config/site";

export type ReportCoverKind =
  | "diagnosis"
  | "goalWeekly"
  | "goalMonthly"
  | "growth"
  | "performance"
  | "inquiryDesign"
  | "inquiryFinal"
  | "inquiryRecord"
  | "selfeval";

export type ReportCoverPreset = {
  serviceLabel: string;
  englishLabel: string;
  areasHeading: string;
  subtitle: readonly [string, string];
  areas: readonly string[];
  /** 정보 줄 세 번째 칸 라벨. 날짜 없는 리포트는 null. */
  dateLabel: string | null;
  disclaimer: string;
};

const GOAL_DISCLAIMER = `본 리포트는 학생의 학습 기록과 계획 실행 데이터를 바탕으로 하여 ${site.brandName} 목표관리 결과에 대하여 작성한 내용입니다.`;

export const REPORT_COVER_PRESETS: Record<ReportCoverKind, ReportCoverPreset> =
  {
    diagnosis: {
      serviceLabel: "학습진단",
      englishLabel: "LEARNING DIAGNOSIS REPORT",
      areasHeading: "DIAGNOSIS AREAS",
      subtitle: [
        "학습 성향부터 영역별 성취도, 맞춤 학습 처방까지",
        "데이터로 읽는 우리 자녀의 현재와 다음 단계.",
      ],
      areas: [
        "학습 성향 분석",
        "영역별 성취도",
        "취약 유형 진단",
        "맞춤 학습 처방",
      ],
      dateLabel: "진단일",
      disclaimer: `본 리포트는 학생의 사전설문을 바탕으로 하여 ${site.brandName} 학습진단 결과에 대하여 작성한 내용입니다.`,
    },
    goalWeekly: {
      serviceLabel: "목표관리",
      englishLabel: "GROWTH REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "계획과 실행, 공부량과 컨디션까지",
        "데이터로 읽는 이번 주의 성장 흐름.",
      ],
      areas: ["한눈에 보기", "실행 분석", "성과의 변화"],
      dateLabel: "기간",
      disclaimer: GOAL_DISCLAIMER,
    },
    goalMonthly: {
      serviceLabel: "목표관리",
      englishLabel: "GROWTH REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "계획과 실행, 공부량과 컨디션까지",
        "데이터로 읽는 이번 달의 성장 흐름.",
      ],
      areas: ["한눈에 보기", "실행 분석", "성과의 변화", "다음 달 전략"],
      dateLabel: "기간",
      disclaimer: GOAL_DISCLAIMER,
    },
    growth: {
      serviceLabel: "성장설계",
      englishLabel: "GROWTH DESIGN REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "지금까지의 활동과 학생 조사를 함께 읽고",
        "남은 학기를 하나의 방향으로 설계합니다.",
      ],
      areas: [
        "대주제와 핵심 정체성",
        "지금까지의 활동",
        "5축 역량 진단",
        "남은 기간 설계",
      ],
      dateLabel: "발행일",
      disclaimer: `본 리포트는 학생 조사와 저장된 활동 기록을 바탕으로 하여 ${site.brandName} 성장설계 결과에 대하여 작성한 내용입니다.`,
    },
    performance: {
      serviceLabel: "수행평가",
      englishLabel: "PERFORMANCE ASSESSMENT REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "안내문 분석부터 구성 설계, 제출 전 점검까지",
        "학생이 스스로 완성하는 수행평가.",
      ],
      areas: [
        "안내문 요구 형식 분석",
        "주제와 자료",
        "작성 구조 설계",
        "평가 기준 점검",
      ],
      dateLabel: "저장일",
      disclaimer: `본 리포트는 학교 수행평가 안내문과 학생 입력을 바탕으로 하여 ${site.brandName} 수행평가 결과에 대하여 작성한 내용입니다.`,
    },
    inquiryDesign: {
      serviceLabel: "심화탐구",
      englishLabel: "IN-DEPTH RESEARCH DESIGN REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "이미 수행한 활동에서 이어지는 후속 탐구를",
        "질문과 가설, 방법, 평가 기준까지 설계합니다.",
      ],
      areas: [
        "탐구 개요",
        "8절 탐구 설계",
        "자료 확보 계획",
        "평가 기준 미리 보기",
      ],
      dateLabel: null,
      disclaimer: `본 리포트는 출발 활동과 학생 입력을 바탕으로 하여 ${site.brandName} 심화탐구 결과에 대하여 작성한 내용입니다.`,
    },
    inquiryFinal: {
      serviceLabel: "심화탐구",
      englishLabel: "IN-DEPTH RESEARCH REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "설계부터 평가, 확정 저장까지",
        "학생이 직접 완성한 심화탐구의 전 과정.",
      ],
      areas: ["설계 리포트", "평가 리포트", "확정 저장 내용", "최종 본문"],
      dateLabel: "확정일",
      disclaimer: `본 리포트는 출발 활동과 학생이 작성한 보고서를 바탕으로 하여 ${site.brandName} 심화탐구 결과에 대하여 작성한 내용입니다.`,
    },
    inquiryRecord: {
      serviceLabel: "심화탐구",
      englishLabel: "IN-DEPTH RESEARCH RECORD",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "설계와 평가를 한 번에 모아",
        "지금까지 진행한 심화탐구를 정리합니다.",
      ],
      areas: ["설계 리포트", "평가 리포트", "확정 저장 내용"],
      dateLabel: null,
      disclaimer: `본 리포트는 출발 활동과 학생이 작성한 보고서를 바탕으로 하여 ${site.brandName} 심화탐구 결과에 대하여 작성한 내용입니다.`,
    },
    selfeval: {
      serviceLabel: "자기평가",
      englishLabel: "SELF EVALUATION REPORT",
      areasHeading: "REPORT CONTENTS",
      subtitle: [
        "선택한 활동 기록에서 문항에 맞는 근거를 골라",
        "학생이 스스로 완성한 자기평가서.",
      ],
      areas: [
        "연계 발전 지점",
        "과정과 역할",
        "결과와 판단",
        "정리와 다음 단계",
      ],
      dateLabel: "저장일",
      disclaimer: `본 자기평가서는 학생이 선택한 활동 기록과 입력 내용을 바탕으로 하여 ${site.brandName} 자기평가 결과에 대하여 작성한 내용입니다.`,
    },
  };
