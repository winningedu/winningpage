// 코칭 판정 엔진(W9). 서비스 자료를 받아 판정, 6축 점수, 5대 역량, 종합 신호를 만드는 순수 함수 모음.
// 문구표(코칭 판정 문구표)와 6축 역량 연결표의 행을 그대로 옮긴다. 자료가 없는 지표는 분모에서 뺀다(결정 4).

import type { ServiceKey } from "./serviceUsage.js";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** 하루 기록. 시간 단위는 시간(소수 가능). 목표가 없는 날은 ideal 0. */
export interface GoalDay {
  date: string;
  weekday: Weekday;
  ideal: number;
  min: number;
  actual: number;
}

export interface GoalWeek {
  setDays: number;
  metDays: number;
  achievementPct: number | null;
}

/**
 * 최근 7일 요약(연결표 r3, r4). 목표 설정일은 월~토 중 이상 목표가 있는 날이고 일요일은 넣지 않는다.
 * 달성율 = (설정일 실제 합 + 일요일 실제) ÷ 설정일 이상 목표 합 x 100, 화면 값은 100 을 넘을 수 있다.
 */
export function summarizeGoalWeek(days: GoalDay[]): GoalWeek {
  const setDays = days.filter((d) => d.weekday !== "sun" && d.ideal > 0);
  if (setDays.length === 0) {
    return { setDays: 0, metDays: 0, achievementPct: null };
  }
  const idealSum = setDays.reduce((sum, d) => sum + d.ideal, 0);
  const actualSum =
    setDays.reduce((sum, d) => sum + d.actual, 0) +
    days
      .filter((d) => d.weekday === "sun")
      .reduce((sum, d) => sum + d.actual, 0);
  return {
    setDays: setDays.length,
    metDays: setDays.filter((d) => d.actual >= d.min).length,
    achievementPct: (actualSum / idealSum) * 100,
  };
}

export type VerdictLevel = "good" | "caution" | "risk" | "no_data";

export interface Verdict {
  level: VerdictLevel;
  reason?: string;
}

export interface ExecutionInput {
  usesGoal: boolean;
  /** 마지막 접속 뒤 지난 날. 접속 기록을 읽지 못하면 없다(규칙 ⑵ 를 건너뛴다). */
  daysSinceLastSeen?: number | null;
  week?: GoalWeek;
}

/** 판정 축 ① 실행(문구표 r2~r8, 순서대로 첫 일치). */
export function executionVerdict(input: ExecutionInput): Verdict {
  if (!input.usesGoal || !input.week) return { level: "no_data" };
  const { setDays, metDays, achievementPct } = input.week;
  if ((input.daysSinceLastSeen ?? 0) >= 7) {
    return { level: "risk", reason: "미접속" };
  }
  if (setDays === 0 || achievementPct === null) {
    return { level: "no_data", reason: "목표 없음" };
  }
  if (metDays < setDays / 2) return { level: "risk", reason: "최소 미충족" };
  if (achievementPct < 40) return { level: "risk", reason: "달성율 낮음" };
  if (achievementPct >= 70 && metDays >= setDays - 1) return { level: "good" };
  return { level: "caution" };
}

// 학습진단 영역 코드. 앞 6개가 1쪽(학습 실행 역량), 뒤 6개가 2쪽(준비도)이다.
export const EXECUTION_AREAS = [
  "GOAL",
  "PLAN",
  "EXEC",
  "TIME",
  "FEEDBACK",
  "STABILITY",
] as const;
export const READINESS_AREAS = [
  "SUBJECT",
  "PERFORM",
  "INQUIRY",
  "ACTIVITY",
  "RECORD",
  "STRATEGY",
] as const;
export type AreaCode =
  | (typeof EXECUTION_AREAS)[number]
  | (typeof READINESS_AREAS)[number];
export type AreaScores = Record<AreaCode, number>;

export type Urgency = "low" | "normal" | "high" | "very_high";

/** 긴급도 4단계(결정 3, 36). 12개 영역 중 가장 낮은 점수가 45 미만 매우 높음, 60 미만 높음, 70 미만 보통. */
export function urgencyOf(areas: AreaScores): Urgency {
  const lowest = Math.min(...Object.values(areas));
  if (lowest < 45) return "very_high";
  if (lowest < 60) return "high";
  if (lowest < 70) return "normal";
  return "low";
}

export interface LearningInput {
  areas: AreaScores;
  /** 학습 실행 역량: 1쪽 6영역 평균. */
  executionAvg: number;
}

/** 판정 축 ② 학습역량(문구표 r9~r12). 긴급도 높음은 높음과 매우 높음이다. */
export function learningVerdict(input: LearningInput | null): Verdict {
  if (!input) return { level: "no_data" };
  const urgency = urgencyOf(input.areas);
  if (
    urgency === "high" ||
    urgency === "very_high" ||
    input.executionAvg < 50
  ) {
    return { level: "risk" };
  }
  if (input.executionAvg >= 75) return { level: "good" };
  return { level: "caution" };
}

/** 판정 축 ③ 연계(문구표 r13~r16). 6축의 진로 연결도 점수를 그대로 쓴다. */
export function linkageVerdict(careerLinkScore: number | null): Verdict {
  if (careerLinkScore === null) return { level: "no_data" };
  if (careerLinkScore >= 70) return { level: "good" };
  if (careerLinkScore >= 50) return { level: "caution" };
  return { level: "risk" };
}

// ---- 6축 -------------------------------------------------------------------------------------

export type GrowthAxisKey = "A" | "B" | "C" | "D" | "E";
export type GradeCurve = "rising" | "flat" | "falling" | "not_judgeable";
export type TopicFit = "fit" | "normal" | "off";
/** 학습진단 성적 흐름 코드 중 점수에 쓰는 것. 비교 자료 부족은 null 로 보낸다(결정 4). */
export type DiagnosisTrend = "up" | "flat" | "partial_down";

/** 성장설계 한 축의 판정과 기록 건수(연결표 r27). 고1 B 처럼 없어도 되는 항목은 optional. */
export interface GrowthAxisState {
  verdict: "confirmed" | "caution" | "none";
  count: number;
  required: number;
  optional?: boolean;
}

/** 서비스별 자료. 서비스를 쓰지 않으면 null. 자료가 없는 지표는 이 모양에 아예 없다(결정 4). */
export interface CoachingMetrics {
  used: Record<ServiceKey, boolean>;
  diagnosis: { areas: AreaScores; trend: DiagnosisTrend | null } | null;
  goal: {
    week: GoalWeek;
    /** 입력 내신 변화, 입력 모의고사 백분위 변화(연결표 r41, r42)를 0~100 으로 바꾼 값. */
    naesinChangeScore: number | null;
    mockChangeScore: number | null;
  } | null;
  growth: {
    axes: Record<GrowthAxisKey, GrowthAxisState | null>;
    curve: GradeCurve | null;
  } | null;
  performance: {
    avgScore: number | null;
    tasks: number;
    feedbackDone: number;
  } | null;
  inquiry: { topicFit: TopicFit | null; reportScore: number | null } | null;
  selfeval: { verifyScore: number | null } | null;
}

export type ServiceLabel =
  | "학습진단"
  | "목표관리"
  | "성장설계"
  | "수행평가"
  | "자기평가"
  | "심화탐구";

export interface Indicator {
  service: ServiceLabel;
  name: string;
  /** 0~100. 자료가 없으면 null 이고 평균에서 빠진다. */
  score: number | null;
}

const roundHalfUp = (value: number) => Math.floor(value + 0.5);
const clamp100 = (value: number) => Math.min(100, Math.max(0, value));

function average(scores: (number | null)[]): number | null {
  const have = scores.filter((s): s is number => s !== null);
  if (have.length === 0) return null;
  return have.reduce((a, b) => a + b, 0) / have.length;
}

function areaAverage(areas: readonly AreaCode[], scores: AreaScores) {
  return average(areas.map((a) => scores[a])) as number;
}

/** 성장설계 판정을 0~100 으로(연결표 r27): 확인됨 85, 아직 없음 25, 주의 25 + 60 x 기록 ÷ 필요. */
export function growthAxisScore(state: GrowthAxisState | null): number | null {
  if (!state) return null;
  if (state.optional && state.count === 0) return null;
  if (state.verdict === "confirmed") return 85;
  if (state.verdict === "none") return 25;
  return 25 + (60 * state.count) / state.required;
}

const FIT_SCORE: Record<TopicFit, number> = { fit: 100, normal: 50, off: 0 };
const CURVE_SCORE: Record<GradeCurve, number | null> = {
  rising: 80,
  flat: 50,
  falling: 25,
  not_judgeable: null,
};
const TREND_SCORE: Record<DiagnosisTrend, number> = {
  up: 80,
  flat: 50,
  partial_down: 35,
};

/** 지표 하나씩의 점수. 키는 6축과 5대 역량이 같이 쓴다. */
export function indicatorsOf(m: CoachingMetrics) {
  const dx = m.diagnosis;
  const area = (code: AreaCode) => dx?.areas[code] ?? null;
  const week = m.goal?.week;
  const growth = (key: GrowthAxisKey) =>
    growthAxisScore(m.growth?.axes[key] ?? null);
  const perf = m.performance;
  const make = (
    service: ServiceLabel,
    name: string,
    score: number | null,
  ): Indicator => ({
    service,
    name,
    score,
  });
  return {
    dxExecution: make(
      "학습진단",
      "학습 실행 역량",
      dx ? areaAverage(EXECUTION_AREAS, dx.areas) : null,
    ),
    dxSubject: make("학습진단", "교과 관리", area("SUBJECT")),
    dxPerform: make("학습진단", "수행 대응", area("PERFORM")),
    dxInquiry: make("학습진단", "탐구 심화", area("INQUIRY")),
    dxActivity: make("학습진단", "활동 연계", area("ACTIVITY")),
    dxRecord: make("학습진단", "기록 정리", area("RECORD")),
    dxStrategy: make("학습진단", "입시 전략", area("STRATEGY")),
    dxTrend: make(
      "학습진단",
      "성적 흐름",
      dx?.trend ? TREND_SCORE[dx.trend] : null,
    ),
    goalAchievement: make(
      "목표관리",
      "목표시간 달성율",
      week && week.achievementPct !== null
        ? clamp100(week.achievementPct)
        : null,
    ),
    goalMinMet: make(
      "목표관리",
      "최소 목표시간 충족률",
      week && week.setDays > 0 ? (week.metDays / week.setDays) * 100 : null,
    ),
    goalNaesinChange: make(
      "목표관리",
      "입력 내신 변화",
      m.goal?.naesinChangeScore ?? null,
    ),
    goalMockChange: make(
      "목표관리",
      "입력 모의고사 백분위 변화",
      m.goal?.mockChangeScore ?? null,
    ),
    growthA: make("성장설계", "학업역량 판정", growth("A")),
    growthB: make("성장설계", "진로와 전공적합성 판정", growth("B")),
    growthC: make("성장설계", "탐구와 자기주도성 판정", growth("C")),
    growthD: make("성장설계", "공동체역량 판정", growth("D")),
    growthE: make("성장설계", "발전가능성 판정", growth("E")),
    growthCurve: make(
      "성장설계",
      "성적 곡선",
      m.growth?.curve ? CURVE_SCORE[m.growth.curve] : null,
    ),
    perfScore: make("수행평가", "평가 점수", perf?.avgScore ?? null),
    perfDone: make(
      "수행평가",
      "피드백 완료율",
      perf && perf.tasks > 0 ? (perf.feedbackDone / perf.tasks) * 100 : null,
    ),
    inquiryFit: make(
      "심화탐구",
      "주제 적합도",
      m.inquiry?.topicFit ? FIT_SCORE[m.inquiry.topicFit] : null,
    ),
    inquiryReport: make(
      "심화탐구",
      "평가 점수",
      m.inquiry?.reportScore ?? null,
    ),
    selfVerify: make("자기평가", "검증 결과", m.selfeval?.verifyScore ?? null),
  };
}

export type Indicators = ReturnType<typeof indicatorsOf>;
export type IndicatorKey = keyof Indicators;

export type AxisKey =
  | "execution"
  | "readiness"
  | "careerLink"
  | "performance"
  | "inquiry"
  | "selfAssessment";

interface AxisDef {
  key: AxisKey;
  name: string;
  /** 이 축을 만드는 주 서비스. 하나도 안 쓰면 "미이용"이다. */
  mainServices: { key: ServiceKey; label: ServiceLabel }[];
  indicators: IndicatorKey[];
  /** 주 서비스가 이용 중이어도 결과가 나오기 전이면 점수 없이 "평가 전"인 축(연결표 r16, r18). */
  evaluatedBy?: IndicatorKey;
}

const SERVICE_LABEL: Record<ServiceKey, ServiceLabel> = {
  diagnosis: "학습진단",
  goal: "목표관리",
  growth: "성장설계",
  performance: "수행평가",
  selfeval: "자기평가",
  inquiry: "심화탐구",
};
const main = (...keys: ServiceKey[]) =>
  keys.map((key) => ({ key, label: SERVICE_LABEL[key] }));

// 레이더 순서(시계 방향, 위쪽부터). 동점 판정의 순서이기도 하다.
export const AXIS_DEFS: AxisDef[] = [
  {
    key: "execution",
    name: "학습 실행력",
    mainServices: main("diagnosis", "goal"),
    indicators: ["dxExecution", "goalAchievement", "goalMinMet"],
  },
  {
    key: "readiness",
    name: "목표대학 준비도",
    mainServices: main("goal", "growth"),
    indicators: ["dxStrategy", "dxSubject"],
  },
  {
    key: "careerLink",
    name: "진로 연결도",
    mainServices: main("growth", "performance", "inquiry"),
    indicators: ["inquiryFit", "dxActivity"],
  },
  {
    key: "performance",
    name: "수행평가 완성도",
    mainServices: main("performance"),
    indicators: ["perfScore", "perfDone", "dxPerform"],
  },
  {
    key: "inquiry",
    name: "탐구 완성도",
    mainServices: main("inquiry"),
    indicators: ["inquiryReport", "dxInquiry"],
    evaluatedBy: "inquiryReport",
  },
  {
    key: "selfAssessment",
    name: "자기평가 충실도",
    mainServices: main("selfeval"),
    indicators: ["selfVerify", "dxRecord"],
    evaluatedBy: "selfVerify",
  },
];

export interface AxisResult {
  key: AxisKey;
  name: string;
  score: number | null;
  status: "scored" | "not_used" | "before_eval";
  /** 미이용일 때, 쓰지 않는 주 서비스. */
  missingServices: ServiceLabel[];
  /** 점수를 만든 지표 중 가장 낮은 것(점수가 같으면 앞의 지표). */
  cause: Indicator | null;
}

export interface AxesResult {
  axes: AxisResult[];
  strongest: AxisResult | null;
  weakest: AxisResult | null;
}

/** 6축 점수와 상태(연결표 r2~r19). 점수는 있는 지표의 평균을 사사오입한 정수다. */
export function computeAxes(m: CoachingMetrics): AxesResult {
  const indicators = indicatorsOf(m);
  const axes = AXIS_DEFS.map((def): AxisResult => {
    const missingServices = def.mainServices
      .filter((s) => !m.used[s.key])
      .map((s) => s.label);
    const base = { key: def.key, name: def.name, missingServices, cause: null };
    const mainUsed = missingServices.length < def.mainServices.length;
    if (!mainUsed) {
      return { ...base, score: null, status: "not_used" };
    }
    if (def.evaluatedBy && indicators[def.evaluatedBy].score === null) {
      return {
        ...base,
        score: null,
        status: "before_eval",
        missingServices: [],
      };
    }
    const have = def.indicators
      .map((k) => indicators[k])
      .filter((i) => i.score !== null);
    if (have.length === 0) {
      return { ...base, score: null, status: "not_used" };
    }
    const lowest = have.reduce((a, b) =>
      (b.score as number) < (a.score as number) ? b : a,
    );
    return {
      ...base,
      score: roundHalfUp(average(have.map((i) => i.score)) as number),
      status: "scored",
      missingServices: [],
      cause: lowest,
    };
  });
  const scored = axes.filter((a) => a.status === "scored");
  const pick = (better: (a: number, b: number) => boolean) =>
    scored.reduce<AxisResult | null>(
      (best, a) =>
        best === null || better(a.score as number, best.score as number)
          ? a
          : best,
      null,
    );
  return {
    axes,
    strongest: pick((a, b) => a > b),
    weakest: pick((a, b) => a < b),
  };
}
