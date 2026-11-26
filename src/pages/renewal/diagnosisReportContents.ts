// 학습진단 결과리포트 16개 영역 목차. 랜딩 목차 섹션이 순서 그대로 그린다.
// starred 는 고객사 시안에서 별표로 강조한 핵심 영역이다.
export type DiagnosisReportContent = {
  title: string;
  description: string;
  starred: boolean;
};

export const DIAGNOSIS_REPORT_CONTENTS: DiagnosisReportContent[] = [
  {
    title: "진단 요약",
    description: "종합 점수와 핵심 3가지를 한눈에",
    starred: true,
  },
  {
    title: "목표 진단",
    description: "목표 구체성, 동기 유형, 목표 사다리",
    starred: false,
  },
  {
    title: "성적 진단",
    description: "내신, 모의고사 과목별 강약과 흐름",
    starred: false,
  },
  {
    title: "7단계 학습관리 사이클",
    description: "목표 설정부터 피드백까지, 끊기는 단계",
    starred: true,
  },
  {
    title: "방해 요인과 마음 상태",
    description: "공부를 막는 요인, 자신감, 불안 점검",
    starred: false,
  },
  {
    title: "학교생활, 입시 준비도",
    description: "수행 대응, 활동 연계 등 12개 문항",
    starred: false,
  },
  {
    title: "입시 준비도, 목표 대학",
    description: "목표 대학 입결 비교, 학년별 로드맵",
    starred: true,
  },
  {
    title: "MBTI 학습 궁합",
    description: "재미로 보는 유형별 공부 습관",
    starred: true,
  },
  {
    title: "나의 기질 프로파일",
    description: "7가지 기질로 보는 공부 성향",
    starred: false,
  },
  {
    title: "기질 기반 입시 설계",
    description: "기질에 맞는 입시 전략 실행법",
    starred: false,
  },
  {
    title: "진단 후 4주 실행 플랜",
    description: "약한 영역을 주차별 과제로",
    starred: true,
  },
  {
    title: "1주차 목표과제 플래너",
    description: "일정 입력과 매일 기록의 기초",
    starred: false,
  },
  {
    title: "2주차 목표과제 플래너",
    description: "계획을 숫자로, 밀리는 지점 찾기",
    starred: false,
  },
  {
    title: "3주차 목표과제 플래너",
    description: "우선 과제 완료, 잘 되는 패턴 찾기",
    starred: false,
  },
  {
    title: "4주차 목표과제 플래너",
    description: "4주 정리와 다음 4주 계획 짜기",
    starred: false,
  },
  {
    title: "추천 서비스와 다음 단계",
    description: "결과에 맞는 서비스, 재진단 안내",
    starred: false,
  },
];
