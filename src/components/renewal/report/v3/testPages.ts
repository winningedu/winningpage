// Test payload for the v3 report view, written from the types only (no engine
// call). Values follow the improved report PDF sample (H12 track) where the
// PDF shows them; hidden-element variants are built from it in the tests.

import type { DiagnosisV3Pages, ScoreBar } from "@/lib/diagnosis-v3/types";

const p1Stage = (
  code: ScoreBar["code"],
  label: string,
  score: number,
  state: string,
  stateCode: ScoreBar["stateCode"],
): ScoreBar => ({ code, label, score, state, stateCode });

const STAGES: readonly ScoreBar[] = [
  p1Stage("P1_GOAL", "목표 설정", 74, "양호", "TOP"),
  p1Stage("P1_PRIO", "우선순위", 41, "취약", "WEAK"),
  p1Stage("P1_PLAN", "계획 수립", 65, "점검 필요", "MID"),
  p1Stage("P1_EXEC", "학습 수행", 56, "보완 필요", "LOW"),
  p1Stage("P1_LOG", "활동 기록", 56, "보완 필요", "LOW"),
  p1Stage("P1_PATT", "패턴 분석", 74, "양호", "TOP"),
  p1Stage("P1_ADJ", "피드백 조정", 83, "우수", "TOP"),
];

const TOC = [
  { page: 1, title: "진단 요약" },
  { page: 2, title: "목표 진단" },
  { page: 3, title: "성적 진단" },
  { page: 4, title: "7단계 학습관리 사이클" },
  { page: 5, title: "방해 요인과 마음 상태" },
  { page: 6, title: "학교생활 입시 준비도" },
  { page: 7, title: "입시 준비도 목표 대학" },
  { page: 8, title: "재미로 보는 MBTI 학습 궁합" },
  { page: 9, title: "나의 기질 프로파일" },
  { page: 10, title: "기질 기반 입시 설계" },
  { page: 11, title: "진단 후 4주 실행 플랜" },
  { page: 12, title: "1주차 목표과제 플래너" },
  { page: 13, title: "2주차 목표과제 플래너" },
  { page: 14, title: "3주차 목표과제 플래너" },
  { page: 15, title: "4주차 목표과제 플래너" },
  { page: 16, title: "추천 서비스와 다음 단계" },
] as const;

const RX_ITEMS = {
  intro: "응답을 그대로 보여 드리는 대신 4주 뒤 목표로 정리했습니다.",
  lever: "기록 하나만 시작하면 활동 기록과 패턴 분석이 함께 움직입니다.",
  weak: {
    kind: "items",
    items: [
      {
        question: "8-9 실제로 공부한 시간이나 분량을 기록한다.",
        target: "별로에서 대체로로",
        link: "1주차 11/11(수) 이번 주 할 일을 4칸으로 나누기",
      },
    ],
  },
  strong: [
    {
      question: "시험이나 한 주가 끝나면 결과를 보고 계획을 고친다.",
      answer: "매우",
    },
  ],
} as const;

const SCHOOL_BARS: readonly ScoreBar[] = [
  {
    code: "H12_DEEP",
    label: "탐구 심화",
    score: 56,
    state: "보완 필요",
    stateCode: "LOW",
  },
  {
    code: "H12_STRA",
    label: "입시 전략",
    score: 65,
    state: "점검 필요",
    stateCode: "MID",
  },
  {
    code: "H12_SUBJ",
    label: "교과 관리",
    score: 91,
    state: "양호",
    stateCode: "TOP",
  },
];

const MIND_BARS: readonly ScoreBar[] = [
  {
    code: "MIND_EFF",
    label: "자기효능감",
    score: 75,
    state: "상위",
    stateCode: "TOP",
  },
  {
    code: "MIND_GROW",
    label: "성장 마인드셋",
    score: 75,
    state: "상위",
    stateCode: "TOP",
  },
  {
    code: "MIND_RECV",
    label: "불안 회복",
    score: 65,
    state: "보통",
    stateCode: "MID",
  },
];

/** 4p and cover stages: under 45 is a break (22 r50). */
const BROKEN_STAGES = STAGES.map((stage) => ({
  ...stage,
  broken: stage.score < 45,
}));

/** Pages 1 to 6 plus the cover; later pages are another view's concern. */
export type FrontPages = Pick<
  DiagnosisV3Pages,
  "cover" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6"
>;

export const FRONT_PAGES: FrontPages = {
  cover: {
    studentName: "김위닝",
    gradeLabel: "고등학교 2학년",
    schoolTypeLabel: "특목고",
    diagnosedAt: "2026. 11. 10",
    toc: TOC,
    headline: "표지 한 줄 헤드라인",
    stages: BROKEN_STAGES,
    basis:
      "본 리포트는 학생이 직접 입력한 응답과 성적을 바탕으로 산출되었습니다.",
  },
  p1: {
    title: "목표는 분명하지만 실행을 꾸준히 이어가는 힘이 부족한 상태입니다.",
    typeSummary: {
      name: "목표 실행 불균형형",
      body: "목표를 이번 주 단위의 할 일로 잘게 나누는 작업이 필요합니다.",
    },
    lead: "이번 달은 하루 첫 공부 시간을 취약 과목으로 고정 하나에 집중하세요.",
    profile: {
      grade: "고등학교 2학년",
      school: "특목고",
      target: "고려대학교 경제학과",
      gpa: "1.25 (5등급제)",
      trend: "과목마다 오르내림이 커요",
      period: { from: "11/10(화)", to: "12/7(월)", redx: "12/8(화)" },
      temperament: "끈기 성취형",
      reliability: "양호, 응답 확인 문항에서 이상이 없었습니다.",
    },
    radar: { stages: STAGES, total: 64.4, target: 75 },
    kpi1: {
      label: "가장 낮은 단계",
      area: STAGES[1] as ScoreBar,
      subtitle: "공부 순서를 정할 기준이 없습니다.",
    },
    kpi2: {
      label: "학교생활 입시 준비도",
      total: 68.4,
      sub: "가장 낮은 영역: 탐구 심화 56점",
    },
    kpi3: {
      label: "마음 상태",
      area: MIND_BARS[2] as ScoreBar,
      sub: "가장 높은 영역: 성장 마인드셋 75점",
    },
    traitIntro: "이번 진단에서 확인된 특성 세 가지입니다.",
    traits: [
      {
        heading: "우선순위가 가장 약합니다",
        body: "눈앞의 과제부터 하게 됩니다.",
      },
      {
        heading: "탐구 심화가 가장 낮습니다",
        body: "탐구 질문 도출이 어렵습니다.",
      },
      { heading: "마음 상태: 불안 회복 65점", body: "학습 리듬이 흔들립니다." },
    ],
    one: {
      title: "이번 달 딱 하나",
      actions: ["목표를 이번 주 할 일 단위로 분해", "하루 최소 학습량 설정"],
    },
  },
  p2: {
    title: "목표가 분명하고, 그 이유도 내 안에 있습니다.",
    lead: "목표가 얼마나 구체적인지와 그 목표를 고른 이유를 함께 봅니다.",
    specificity: {
      options: [
        "대학 학과 모두",
        "대학만",
        "학과 계열만",
        "대략적 수준",
        "여러 목표 고민",
        "아직 없음",
      ],
      selectedIndex: 0,
      university: "고려대학교",
      major: "경제학과",
    },
    reasons: {
      chips: ["그 분야에 관심과 적성이 있어서", "희망 직업과 연결되어 있어서"],
      intrinsic: 2,
      extrinsic: 0,
    },
    matrix: {
      cells: [
        { cell: "C_IN", name: "몰입형", desc: "가장 안정적인 조합입니다." },
        { cell: "C_MIX", name: "균형형", desc: "균형 설명" },
        { cell: "C_EX", name: "조건 중심형", desc: "조건 설명" },
        { cell: "E_IN", name: "탐색형", desc: "탐색 설명" },
        { cell: "E_MIX", name: "탐색 균형형", desc: "탐색 균형 설명" },
        { cell: "E_EX", name: "주변 의존형", desc: "주변 설명" },
      ],
      highlighted: "C_IN",
    },
    ladder: {
      far: true,
      mid: true,
      near: false,
      text: "가까운 목표가 비어 있습니다.",
      rungs: {
        far: { source: "3번", text: "FAR 목표 고려대 경제학과" },
        mid: {
          source: "8-1",
          text: "다음 시험에서 받고 싶은 과목별 목표 성적을 정해 두었다.",
          answer: "대체로 그렇다",
        },
        near: {
          source: "8-2",
          text: "이번 주에 끝낼 공부 목표가 분명하다.",
          answer: "보통이다",
        },
      },
    },
    tips: ["학기마다 한 번 목표를 확인하기", "이번 주 공부 목표 정하기"],
  },
  p3: {
    title: "과목마다 오르내림이 큽니다.",
    lead: "내신과 모의고사는 기준이 달라 직접 비교하지 않습니다.",
    gpa: "1.25",
    recent: "전체 평균보다 0.08등급 낮음",
    trend: "과목마다 오르내림이 커요",
    bars: {
      school: [
        { subject: "KOR", grade: 1 },
        { subject: "MATH", grade: 1.5 },
      ],
      mock: { month: 9, grades: [{ subject: "HIST", grade: 2 }] },
    },
    subjects: {
      kind: "table",
      rows: [
        { subject: "KOR", verdict: "STRENGTH", text: "내신에서 최상위입니다." },
        { subject: "MATH", verdict: "CHECK", text: "오답 원인을 확인합니다." },
      ],
      note: "판정 규칙 안내문",
    },
    examOps: {
      heading: "시험 운영 보완",
      body: "시험 보는 방식부터 정하면 가장 빨리 되찾을 수 있는 점수입니다.",
    },
    examOpsVerdict: "보완",
    examOpsEvidence: {
      item: "8-15",
      answer: "별로 그렇지 않다",
      examRoom: "시험장에서 답안 표시를 실수해 점수를 잃어요.",
    },
  },
  p4: {
    title: "우선순위에서 순환이 끊깁니다.",
    lead: "공부는 7단계가 한 바퀴 돌 때 다음 주가 나아집니다.",
    scoreNote: "단계 점수 산식 안내",
    cycle: {
      stages: BROKEN_STAGES,
      total: 64.4,
      gradeText: "점검 필요, 영역별 편차가 있습니다.",
      caption: "일곱 단계의 상대적 균형을 보여줍니다.",
    },
    breaks: [
      { heading: "우선순위 41", body: "공부 순서를 정할 기준이 없습니다." },
      { heading: "학습 수행 56", body: "시작을 미루는 일이 반복됩니다." },
      { heading: "활동 기록 56", body: "얼마나 공부했는지 남지 않습니다." },
    ],
    why: { heading: "왜 기록부터인가", body: "기록한 집단이 더 높았습니다." },
    rx: RX_ITEMS,
  },
  p5: {
    title: "방해 요인은 우선순위에 몰려 있습니다.",
    lead: "방해 요인과 마음 상태를 함께 봅니다.",
    groups: [
      {
        area: "우선순위",
        options: [
          { label: "무엇부터 공부해야 할지 모르겠어요.", selected: false },
          { label: "중요한 과목이 자꾸 뒤로 밀려요.", selected: true },
        ],
      },
      { area: "계획 수립", options: [] },
    ],
    mind: {
      bars: MIND_BARS,
      note: "마음 상태 점수는 종합점수에 들어가지 않습니다.",
    },
    interpretation: {
      areas: [
        "자기효능감 75 해석",
        "성장 마인드셋 75 해석",
        "불안 회복 65 해석",
      ],
      weak: "최소 학습량을 지키며 리듬을 회복하는 것이 먼저입니다.",
    },
    crossCheck: {
      kind: "items",
      items: [
        {
          option: "중요한 과목이 자꾸 뒤로 밀려요.",
          area: STAGES[1] as ScoreBar,
          answers: [{ question: "8-3", answer: "보통" }],
          text: "일치",
        },
      ],
    },
  },
  p6: {
    title: "가장 낮은 영역은 탐구 심화입니다.",
    lead: "체감하는 어려움과 실제 약점이 같은지 봅니다.",
    bars: {
      areas: SCHOOL_BARS,
      total: 68.4,
      gradeText: "영역별 편차가 있어 연결성을 점검할 시점입니다.",
    },
    hardest: [{ option: "탐구 주제를 정하기 어려워요.", area: "탐구 심화" }],
    overlap: "고른 영역이 모두 하위 영역입니다.",
    strengths: [
      { heading: "교과 관리 91", body: "강약점을 스스로 구분합니다." },
    ],
    strengthNote: "60점 이상 영역이 하나입니다.",
    weaknesses: [
      { heading: "탐구 심화 56", body: "가설 검증 구조로 바꿔야 합니다." },
    ],
    rx: {
      intro: "응답을 4주 목표로 정리했습니다.",
      weak: { kind: "none", text: "별로 이하로 답한 문항이 없습니다." },
      strong: [],
    },
  },
};
