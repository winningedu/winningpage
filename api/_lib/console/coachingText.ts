// 코칭 문구 엔진(W9). 문구표 r23~r179, r185~r201 의 문장을 판정 결과와 서비스 자료로 조립한다.
// 문장 기호는 화면용으로 이미 바꿔 적었다(결정 6: 가운뎃점은 쉼표, 긴 줄표와 화살표는 쉼표나 콜론).
// 자료가 없어 만들 수 없는 문장은 null 이나 빈 목록이고, 화면은 그 칸을 그리지 않는다.

import {
  type AreaCode,
  type AxesResult,
  type AxisKey,
  type AxisResult,
  type CoachingMetrics,
  type Competency,
  EXECUTION_AREAS,
  type GoalDay,
  type GoalWeek,
  hasFinalConsonant,
  type IndicatorKey,
  indicatorsOf,
  READINESS_AREAS,
  urgencyOf,
  type Verdicts,
} from "./coaching.js";

export const AREA_NAME: Record<AreaCode, string> = {
  GOAL: "목표 설정",
  PLAN: "계획 설계",
  EXEC: "실행 지속",
  TIME: "시간 관리",
  FEEDBACK: "학습 피드백",
  STABILITY: "학습 안정",
  SUBJECT: "교과 관리",
  PERFORM: "수행 대응",
  INQUIRY: "탐구 심화",
  ACTIVITY: "활동 연계",
  RECORD: "기록 정리",
  STRATEGY: "입시 전략",
};

// 학습진단 맞춤 전략(문구표 r121~r132). 앞의 두 개와 뒤의 두 개를 단계별로 쓴다.
export const STRATEGIES: Record<AreaCode, string[]> = {
  GOAL: [
    "목표 대학, 학과 조사",
    "관심 분야와 적성 정리",
    "다음 시험의 목표 등급 설정",
    "목표 과목, 단원 우선순위 정하기",
  ],
  PLAN: [
    "월간 계획을 주간, 일간으로 분해",
    "계획을 문제 수, 페이지 단위로 작성",
    "시험과 수행평가 일정 통합",
    "주 1회 계획 조정 시간 고정",
  ],
  EXEC: [
    "하루 최소 학습량 설정",
    "계획량 축소",
    "매일 실천 여부 확인",
    "미완료 과제 자동 이월",
  ],
  TIME: [
    "고정 일정 먼저 입력",
    "가용 자습시간 계산",
    "취약 과목 우선 배치",
    "실행 불가능한 계획 삭제",
  ],
  FEEDBACK: [
    "오답 원인 4분류(개념, 적용, 실수, 시간 부족)",
    "시험 후 과목별 학습 방법 수정",
    "주간 복습 시간 고정",
    "오답 재풀이 주기 설정",
  ],
  STABILITY: [
    "최소 학습량 유지",
    "부담이 커지는 상황 정리해 보기",
    "멘토 상담 연결",
    "2주 단위 단기 목표로 재설정",
  ],
  SUBJECT: [
    "과목별 성적 추이 정리",
    "취약 과목 2개 선정",
    "과목별 학습법 확정",
    "다음 시험 목표 등급 설정",
  ],
  INQUIRY: [
    "교과 개념에서 탐구 질문 도출",
    "논문, 공공데이터 활용",
    "조사에서 분석 중심으로 전환",
    "가설, 검증, 해석, 한계 구조 적용",
  ],
  RECORD: [
    "역할, 과정, 결과, 배운 점 4항목 기록",
    "활동 직후 자기평가서 작성",
    "학기말 활동 목록 정리",
    "근거 자료 보관 규칙 정하기",
  ],
  PERFORM: [
    "안내문 요구사항 추출",
    "평가기준, 제출조건 확인",
    "마감일 역산 일정 수립",
    "시험 일정과 분리 배치",
  ],
  STRATEGY: [
    "목표 대학 전형 확인",
    "현재 내신과 입결 비교",
    "도전, 적정, 안정 지원군 설정",
    "학년별 보완 과제 정리",
  ],
  ACTIVITY: [
    "기존 활동의 한계 확인",
    "후속 질문 설정",
    "학년별 활동 흐름 연결",
    "진로 키워드와 교과 매칭",
  ],
};

const URGENCY_NAME = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  very_high: "매우 높음",
};
const WEEKDAY_NAME = {
  mon: "월요일",
  tue: "화요일",
  wed: "수요일",
  thu: "목요일",
  fri: "금요일",
  sat: "토요일",
  sun: "일요일",
} as const;

/** 영역 상태 이름(1쪽 학습 실행 역량과 2쪽 준비도가 다르다). */
export function areaState(code: AreaCode, score: number): string {
  const page1 = (EXECUTION_AREAS as readonly string[]).includes(code);
  const names = page1
    ? ["상위", "보통", "보완 필요", "취약"]
    : ["양호", "점검 필요", "보완 필요", "우선 보완"];
  return names[
    score >= 70 ? 0 : score >= 60 ? 1 : score >= 45 ? 2 : 3
  ] as string;
}

export interface GoalFacts {
  week: GoalWeek;
  lastWeek: GoalWeek | null;
  /** 지난주 7일(서비스 상세의 14일 표용), 최근 날짜부터. */
  previousDays?: GoalDay[];
  /** 최근 7일, 최근 날짜부터. date 는 YYYY-MM-DD. */
  days: GoalDay[];
  /** 최근 목표일부터 거꾸로 이어진 최소 목표 충족일 수. */
  streak: number;
  daysSinceLastSeen: number | null;
  /** 이번 주에 학생이 기록한 방해 요인(기록마다 한 번씩). */
  reasons: string[];
  lastWeekAvgActual: number | null;
}

export interface TextFacts {
  grade: string | null;
  month: number;
  /** 목표학과. 없으면 "관심 분야"를 쓴다(교 #83). */
  department: string | null;
  metrics: CoachingMetrics;
  axes: AxesResult;
  competencies: Competency[];
  verdicts: Verdicts;
  type: { code: string; name: string };
  goal: GoalFacts | null;
  /** 피드백 대기 수행평가. */
  pendingPerformance: { title: string | null; subject: string | null }[];
  inquiryTopic: string | null;
  growthKeywords: string[];
  /** 같은 등급제일 때 학습진단 평균 내신과 목표관리 입력 내신. */
  gradeCheck: { diagnosis: number; goalInput: number } | null;
}

const withParticle = (word: string, a: string, b: string) =>
  `${word}${hasFinalConsonant(word) ? a : b}`;
const pct = (n: number) => Math.round(n);

/** 지난주 대비(문구표 r203). 지난주 자료가 없으면 빈 문자열. */
export function vsLastWeek(
  current: number | null,
  last: number | null,
  form: "paren" | "list",
): string {
  if (current === null || last === null) return "";
  const diff = Math.round(current) - Math.round(last);
  const text =
    diff === 0
      ? "지난주와 같음"
      : `지난주보다 ${Math.abs(diff)}%p ${diff > 0 ? "상승" : "하락"}`;
  return form === "paren" ? `(${text})` : `, ${text}`;
}

const dept = (f: TextFacts) => f.department ?? "관심 분야";
const ach = (f: TextFacts) => f.goal?.week.achievementPct ?? null;
const vs = (f: TextFacts, form: "paren" | "list") =>
  vsLastWeek(ach(f), f.goal?.lastWeek?.achievementPct ?? null, form);

function lowestArea(
  f: TextFacts,
  areas: readonly AreaCode[],
): { code: AreaCode; score: number } | null {
  const scores = f.metrics.diagnosis?.areas;
  if (!scores) return null;
  return areas.reduce<{ code: AreaCode; score: number } | null>(
    (best, code) =>
      best === null || scores[code] < best.score
        ? { code, score: scores[code] }
        : best,
    null,
  );
}

const first = (code: AreaCode) => STRATEGIES[code][0] as string;

/** 원인 지표별 상담 문구(문구표 r159~r176 의 화살표 뒤). 자료가 없으면 null. */
export function counselFor(
  key: IndicatorKey | null | undefined,
  f: TextFacts,
): string | null {
  const area = (code: AreaCode) =>
    `학습진단 ${AREA_NAME[code]}: ${first(code)}`;
  switch (key) {
    case "dxExecution": {
      const low = lowestArea(f, EXECUTION_AREAS);
      return low
        ? `학습진단 가장 시급한 영역(${AREA_NAME[low.code]})부터, ${first(low.code)}`
        : null;
    }
    case "goalAchievement":
      return "이상 목표시간 대비 실제 학습시간이 부족한 과목, 요일 점검";
    case "goalMinMet":
      return "최소 목표시간을 매일 먼저 채우는 습관부터";
    case "growthTalent":
      return "성장설계 대학 인재상 비교에서 부족한 항목을 다음 활동으로 채우기";
    case "dxStrategy":
      return area("STRATEGY");
    case "dxSubject":
      return area("SUBJECT");
    case "growthNear":
      return "성장설계 활동 지도에서 대주제와 먼 활동을 정리하고 다음 활동을 대주제 쪽으로";
    case "perfLink":
      return "다음 수행평가 주제를 목표 학과와 연결";
    case "inquiryFit":
      return "심화탐구 주제를 목표 학과 쪽으로 조정";
    case "dxActivity":
      return area("ACTIVITY");
    case "perfScore":
      return '수행평가 평가 리포트의 "보완할 점"을 다음 과제에 먼저 반영';
    case "perfDone":
      return `피드백 대기 수행평가 ${f.pendingPerformance.length}건 수정, 재제출`;
    case "dxPerform":
      return area("PERFORM");
    case "inquiryReport":
      return '심화탐구 평가 리포트의 "먼저 고칠 것"부터 수정';
    case "dxInquiry":
      return area("INQUIRY");
    case "selfVerify":
      return "자기평가 검증에서 미충족 항목(판단, 한계, 연계)부터 보완";
    case "dxRecord":
      return area("RECORD");
    default:
      return null;
  }
}

/** 축 우선 과제 문장(문구표 r94, 유형 K, H, I, J 의 한줄 진단). */
function axisSentence(f: TextFacts, key: AxisKey): string | null {
  const axis = f.axes.axes.find((a) => a.key === key);
  if (!axis || axis.score === null || !axis.cause) return null;
  const counsel = counselFor(axis.causeKey, f);
  if (!counsel) return null;
  return `${withParticle(axis.name, "이", "가")} ${axis.score}점으로 6축 중 가장 보완이 필요합니다(원인 ${axis.cause.service} ${axis.cause.name} ${pct(axis.cause.score as number)}점). 먼저 할 일: ${counsel}.`;
}

const execPrefix = (f: TextFacts) => {
  const level = f.verdicts.execution.level;
  if (level === "good") return "실행은 안정적이지만 ";
  if (level === "caution")
    return `실행은 보통(목표시간 달성율 ${pct(ach(f) ?? 0)}%)이고 `;
  return "";
};

// ---- 우선 과제와 유형 과제 -----------------------------------------------------------------

/** 우선 과제(문구표 r184): 코칭 유형의 한줄 진단을 그대로 쓴다. */
export function priorityTask(f: TextFacts): string | null {
  const week = f.goal?.week;
  const set = week?.setDays ?? 0;
  const met = week?.metDays ?? 0;
  const a = ach(f);
  const lowExec = lowestArea(f, EXECUTION_AREAS);
  const execAvg = f.metrics.diagnosis
    ? EXECUTION_AREAS.reduce(
        (s, c) => s + (f.metrics.diagnosis?.areas[c] as number),
        0,
      ) / EXECUTION_AREAS.length
    : null;
  const d = dept(f);
  switch (f.type.code) {
    case "C1":
      return f.goal?.daysSinceLastSeen == null
        ? null
        : `최근 ${f.goal.daysSinceLastSeen}일간 접속 기록이 없어 학습이 멈춘 상태입니다. 우선 과제는 멈춘 이유를 확인하고 최소 목표시간부터 다시 시작하는 것입니다.`;
    case "C2": {
      const lastMet = f.goal?.lastWeek?.metDays;
      return `최근 7일 목표일 ${set}일 중 최소 목표시간을 ${met}일만 지켰습니다${lastMet === undefined ? "" : `(지난주 ${lastMet}일)`}. 우선 과제는 최소 목표시간을 매일 지키는 것입니다.`;
    }
    case "C3":
      return a === null
        ? null
        : `목표시간 달성율이 ${pct(a)}%${vs(f, "paren")}로, 이상 목표시간과 실제 학습시간 차이가 큽니다. 우선 과제는 이상 목표시간을 실제 가능한 수준으로 다시 잡는 것입니다.`;
    case "D1":
      return a === null
        ? null
        : `목표시간 달성율 ${pct(a)}%${vs(f, "paren")}로 계획의 ${100 - pct(a)}%가 밀리고 있습니다. 우선 과제는 밀리는 과목, 시간대를 찾아 계획을 조정하는 것입니다.`;
    case "D2":
      return a === null
        ? null
        : `목표시간 달성율은 ${pct(a)}%지만 최소 목표시간을 못 지킨 날이 ${set - met}일 있어 날마다 편차가 큽니다. 우선 과제는 공부량이 적은 요일을 찾아 최소선을 채우는 것입니다.`;
    case "E1": {
      const low = lowestArea(f, [...EXECUTION_AREAS, ...READINESS_AREAS]);
      if (!low || !f.metrics.diagnosis) return null;
      const urgency = URGENCY_NAME[urgencyOf(f.metrics.diagnosis.areas)];
      const page1 = (EXECUTION_AREAS as readonly string[]).includes(low.code);
      const state = page1
        ? areaState(low.code, low.score)
        : "40점 미만, 학교생활 준비도";
      const name = AREA_NAME[low.code];
      return `${execPrefix(f)}학습진단 긴급도가 '${urgency}'이고, ${withParticle(name, "이", "가")} ${low.score}점(${state})입니다. 우선 과제는 ${name} 보강이며, 첫 단계는 '${first(low.code)}'입니다.`;
    }
    case "E2": {
      if (!lowExec || execAvg === null) return null;
      const name = AREA_NAME[lowExec.code];
      const avg = pct(execAvg);
      return `${execPrefix(f)}학습 실행 역량이 ${avg}점으로 목표 75점에 ${Math.max(0, 75 - avg)}점 못 미치고, 가장 시급한 영역은 ${name}(${lowExec.score}점)입니다. 우선 과제는 ${name} 보강이며, 첫 단계는 '${first(lowExec.code)}'입니다.`;
    }
    case "K":
      return axisSentence(f, "readiness");
    case "H":
      return axisSentence(f, "performance");
    case "I":
      return axisSentence(f, "inquiry");
    case "J":
      return axisSentence(f, "selfAssessment");
    case "F1": {
      const link = f.axes.axes.find((a) => a.key === "careerLink");
      if (!link || link.score === null) return null;
      const prefix =
        f.verdicts.execution.level === "good" &&
        f.verdicts.learning.level === "good"
          ? "실행과 학습역량은 안정적이지만 "
          : "";
      const parts = indicatorList(f, [
        "growthNear",
        "perfLink",
        "inquiryFit",
        "dxActivity",
      ]);
      return `${prefix}${withParticle(d, "과", "와")}의 연결이 약합니다(진로 연결도 ${link.score}점: ${parts}). 우선 과제는 다음 활동 주제를 ${withParticle(d, "과", "와")} 연결하는 것입니다.`;
    }
    case "A": {
      const lvl = f.verdicts.execution.level;
      const summary =
        lvl === "good"
          ? `실행은 안정적입니다(목표시간 달성율 ${pct(a ?? 0)}%)`
          : lvl === "caution"
            ? `실행은 보통입니다(목표시간 달성율 ${pct(a ?? 0)}%)`
            : f.metrics.used.goal
              ? "최근 7일 설정된 목표시간도 없습니다"
              : "목표관리 기록도 없습니다";
      return `학습진단 결과가 없어 학습 역량을 판단할 수 없습니다. ${summary}. 우선 과제는 학습진단 응시입니다.`;
    }
    case "B": {
      const noGoal = f.metrics.used.goal;
      const tail =
        lowExec && execAvg !== null
          ? `학습 실행 역량은 ${pct(execAvg)}점(목표 75점)이고 ${lowExec.score < 75 ? `가장 시급한 영역은 ${AREA_NAME[lowExec.code]}(${lowExec.score}점)입니다` : "모든 영역이 목표 점수 이상입니다"}`
          : null;
      if (!tail) return null;
      return `${noGoal ? "최근 7일 설정된 목표시간이 없어" : "목표관리 기록이 없어"} 실행 상태를 알 수 없습니다. ${tail}. 우선 과제는 ${noGoal ? "하루 이상, 최소 목표시간 설정" : "이상, 최소 목표대학과 하루 목표시간 설정"}입니다.`;
    }
    case "F2":
      return `실행과 학습역량은 안정적이지만 성장설계, 수행평가, 심화탐구 기록이 없어 ${d} 연결을 보여줄 활동이 아직 없습니다. 우선 과제는 ${withParticle(d, "과", "와")} 연결되는 탐구 질문 1개 정하기입니다.`;
    case "G1":
      // 탐구 단계 이름의 출처가 없어 만들지 않는다.
      return null;
    case "G2": {
      const best = f.axes.strongest;
      if (!best) return null;
      return `실행, 학습역량, 연계가 모두 안정적입니다(${best.name} ${best.score}점). 우선 과제는 ${d} 관련 심화탐구를 시작하는 것입니다.`;
    }
    default:
      return null;
  }
}

function indicatorList(f: TextFacts, keys: IndicatorKey[]): string {
  return keys
    .map((k) => indicatorLabel(f, k))
    .filter((t): t is string => t !== null)
    .join(", ");
}

function indicatorLabel(f: TextFacts, key: IndicatorKey): string | null {
  const i = indicatorsOf(f.metrics)[key];
  return i.score === null ? null : `${i.service} ${i.name} ${pct(i.score)}점`;
}

// ---- 향후 진로계획 -------------------------------------------------------------------------

/** 유형 과제 3개(문구표 유형별 "유형 과제" 행). 우선 2주, 이번 학기, 다음 학기 순서. */
export function typeTasks(f: TextFacts): string[] | null {
  const week = f.goal?.week;
  const a = f.goal ? pct(ach(f) ?? 0) : 0;
  const set = week?.setDays ?? 0;
  const met = week?.metDays ?? 0;
  const d = dept(f);
  const counsel = (axis: AxisKey) => {
    const r = f.axes.axes.find((x) => x.key === axis);
    return counselFor(r?.causeKey, f);
  };
  const lowExec = lowestArea(f, EXECUTION_AREAS);
  switch (f.type.code) {
    case "C1":
      return [
        "접속 중단 이유 상담과 복귀 날짜 약속",
        `최소 목표시간 매일 충족(현재 ${met}/${set}일)`,
        "목표시간 달성율 70% 이상 회복",
      ];
    case "C2":
      return [
        `최소 목표시간 매일 충족(현재 ${met}/${set}일)`,
        "최소선을 못 지킨 요일의 일정 조정",
        "목표시간 달성율 70% 이상 유지",
      ];
    case "C3":
      return [
        "이상 목표시간을 실제 가능한 수준으로 재설정",
        `목표시간 달성율 ${a}%에서 70% 단계 회복`,
        "달성율 70% 유지 후 목표시간 점진 상향",
      ];
    case "D1":
      return [
        "밀리는 과목, 시간대 확인 후 계획 조정",
        "목표시간 달성율 70% 이상 안착",
        "달성율 80%로 상향",
      ];
    case "D2":
      return [
        "공부량이 적은 요일 확인",
        `최소 목표시간 주 ${set}일 모두 충족`,
        `요일 편차 없이 달성율 ${a}% 이상 유지`,
      ];
    case "E1": {
      const low = lowestArea(f, [...EXECUTION_AREAS, ...READINESS_AREAS]);
      if (!low) return null;
      const n = AREA_NAME[low.code];
      return [
        `${n}(${low.score}점) 원인 점검 상담`,
        `${n}: ${STRATEGIES[low.code][0]}, 이어서 ${STRATEGIES[low.code][1]}`,
        `학습진단 재응시로 ${n} 변화 확인`,
      ];
    }
    case "E2": {
      if (!lowExec) return null;
      const n = AREA_NAME[lowExec.code];
      const s = STRATEGIES[lowExec.code];
      return [
        `${n}: ${s[0]}`,
        `${n}: ${s[2]}, 이어서 ${s[3]}`,
        "학습진단 재응시로 학습 실행 역량 75점 도달 확인",
      ];
    }
    case "K": {
      const c = counsel("readiness");
      return c
        ? [
            c,
            "최소 목표대학 기준으로 과목별 목표 등급 점검",
            "목표대학 준비도 70점 이상",
          ]
        : null;
    }
    case "F1":
      return [
        `다음 수행평가 주제를 ${withParticle(d, "과", "와")} 연결`,
        "연결된 활동을 성장설계 스토리에 반영",
        "진로 연결도 70점 이상",
      ];
    case "H": {
      const c = counsel("performance");
      return c
        ? [
            c,
            "평가 리포트의 보완할 점을 다음 수행평가 설계에 반영",
            "수행평가 완성도 70점 이상",
          ]
        : null;
    }
    case "I": {
      const c = counsel("inquiry");
      return c
        ? [
            c,
            "가설, 검증, 해석, 한계 구조로 보고서 점검",
            "탐구 완성도 70점 이상",
          ]
        : null;
    }
    case "J": {
      const c = counsel("selfAssessment");
      return c
        ? [
            c,
            "수행평가, 심화탐구 산출물 중 스토리에 맞는 활동 선별",
            "자기평가 충실도 70점 이상",
          ]
        : null;
    }
    case "A":
      return [
        "학습진단 응시",
        "진단 결과의 가장 시급한 영역 보강 계획",
        "학습진단 재응시로 변화 확인",
      ];
    case "B": {
      const goalText = f.metrics.used.goal
        ? "하루 이상, 최소 목표시간 설정"
        : "이상, 최소 목표대학과 하루 목표시간 설정";
      return [
        goalText,
        "최소 목표시간 매일 충족",
        "목표시간 달성율 70% 이상 유지",
      ];
    }
    case "F2":
      return [
        `${d} 관련 탐구 질문 1개 정하기`,
        "수행평가 또는 심화탐구로 첫 기록 남기기",
        "기록을 성장설계 스토리에 연결",
      ];
    case "G2":
      return [
        "현재 실행 수준 유지 확인",
        `${d} 관련 심화탐구 시작`,
        "탐구 보고서 완성",
      ];
    default:
      return null;
  }
}

/** 서비스 다음 할 일(문구표 r107~r116). 앞에서부터 쓰고 모자라면 기본 문구로 채운다. */
export function nextServiceTasks(f: TextFacts): string[] {
  const d = dept(f);
  const tasks: string[] = [];
  if (f.type.code !== "H") {
    for (const p of f.pendingPerformance) {
      const subject = p.subject ? `(${p.subject})` : "";
      tasks.push(
        p.title
          ? `수행평가 '${p.title}'${subject} 피드백 반영 후 재제출`
          : `${p.subject ?? ""} 수행평가 피드백 반영 후 재제출`.trim(),
      );
    }
  }
  const lowGrade = f.grade === "고1" || f.grade === "고2";
  if (
    !f.metrics.used.inquiry &&
    lowGrade &&
    f.type.code !== "F2" &&
    f.type.code !== "G2"
  ) {
    tasks.push(`${d} 관련 심화탐구 주제 탐색 시작`);
  }
  if (lowGrade && !f.metrics.used.growth)
    tasks.push("성장설계로 진로 스토리 대주제 정하기");
  if (lowGrade) {
    return [
      ...tasks,
      `수행평가마다 교과 개념과 ${d} 연결 한 줄 정리`,
      "학기 활동 기록 정리",
      "다음 학년 활동 계획 세우기",
    ].slice(0, 3);
  }
  return tasks;
}

const GRADE3_PLAN: {
  months: [number, number];
  labels: string[];
  tasks: string[];
}[] = [
  {
    months: [3, 6],
    labels: ["지금 ~ 4주", "1학기 중", "여름방학"],
    tasks: [
      "이상, 최소 목표대학 기준 전형 유형 점검",
      "서류에 쓸 활동 근거 선별{근거}",
      "자기평가 문항 초안 작성",
    ],
  },
  {
    months: [7, 9],
    labels: ["지금 ~ 원서 접수", "원서 접수 후", "수능 전"],
    tasks: [
      "자기평가 문항 확정과 교과 근거 연결",
      "면접 예상 질문 점검{근거}",
      "수능 최저 과목에 목표시간 배분",
    ],
  },
  {
    months: [10, 14],
    labels: ["지금 ~ 4주", "수능 전", "졸업 전"],
    tasks: [
      "면접 예상 질문 점검{근거}",
      "수능 최저 과목에 목표시간 배분",
      "최종 등록 확인과 대학 입학 전 학습 계획",
    ],
  },
];

/** 향후 진로계획 3칸. 1, 2학년은 유형 과제와 서비스 다음 할 일, 3학년은 시기 과제(문구표 r117~r120). */
export function careerPlan(
  f: TextFacts,
): { label: string; items: string[] }[] | null {
  const typed = typeTasks(f);
  const service = nextServiceTasks(f);
  if (f.grade === "고3") {
    const month = f.month >= 3 ? f.month : f.month + 12;
    const period = GRADE3_PLAN.find(
      (p) => month >= p.months[0] && month <= p.months[1],
    );
    if (!period) return null;
    const hasRecord =
      f.pendingPerformance.length > 0 || f.inquiryTopic !== null;
    const basis = f.inquiryTopic ? `('${f.inquiryTopic}' 포함)` : "";
    const timed = period.tasks.map((t) =>
      hasRecord
        ? t.replace(
            "{근거}",
            t.startsWith("면접")
              ? f.inquiryTopic
                ? `('${f.inquiryTopic}' 근거)`
                : ""
              : basis,
          )
        : t
            .replace(
              "서류에 쓸 활동 근거 선별{근거}",
              "면접에서 말할 활동 1건 정리",
            )
            .replace(
              "면접 예상 질문 점검{근거}",
              "면접에서 말할 활동 1건 정리",
            ),
    );
    const steps = [
      [typed?.[0], timed[0]],
      [timed[1], service[0]],
      [timed[2], service[1]],
    ];
    return steps.map((items, i) => ({
      label: period.labels[i] as string,
      items: items.filter((t): t is string => !!t),
    }));
  }
  if (!typed) return null;
  const labels = ["우선 2주", "이번 학기", "다음 학기"];
  return labels.map((label, i) => ({
    label,
    items: [typed[i] as string, service[i]].filter((t): t is string => !!t),
  }));
}

// ---- 학습방법 -----------------------------------------------------------------------------

/** 학습방법 3개(문구표 r95~r106 과 유형별 학습방법 행). 만들 수 없는 칸은 건너뛴다. */
export function studyMethods(f: TextFacts): string[] {
  const out: string[] = [];
  const a = ach(f);
  const level = f.verdicts.execution.level;
  const common = (): string | null => {
    if (level === "good") {
      return (a ?? 0) >= 80
        ? "목표시간 달성율 80% 이상을 유지하며 남는 시간을 탐구에 배정하기"
        : `목표시간 달성율을 ${pct(a ?? 0)}%에서 80%까지 끌어올리며 오답, 개념 노트를 탐구 질문으로 연결하기`;
    }
    if (level === "caution") {
      return (a ?? 0) < 70
        ? "밀리는 과목을 하루 단위로 쪼개 배치하기"
        : "공부량이 적은 요일에 최소 목표시간 알림 설정";
    }
    if (level === "no_data")
      return "하루 이상, 최소 목표시간을 정하고 실제 학습시간을 매일 기록하기";
    return null;
  };
  const typed: Record<string, string | undefined> = {
    C1: "다시 시작하는 첫 주는 최소 목표시간만 채우기",
    C2: "최소 목표시간을 하루 첫 공부 블록에 먼저 배치하기",
    D1: "밀리는 과목을 하루 단위로 쪼개 배치하기",
    D2: "공부량이 적은 요일에 최소 목표시간 알림 설정",
    B: "하루 이상, 최소 목표시간을 정하고 실제 학습시간을 매일 기록하기",
  };
  if (f.type.code === "C3") {
    const avg = f.goal?.lastWeekAvgActual;
    if (avg != null)
      out.push(
        `이상 목표시간을 지난주 실제 평균 학습시간보다 30분 많게 잡기(지난주 평균 ${Math.round(avg * 10) / 10}시간)`,
      );
  } else {
    const t = typed[f.type.code] ?? common();
    if (t) out.push(t);
  }

  const dx = f.metrics.diagnosis;
  if (!dx) out.push("학습진단을 응시해 가장 시급한 영역 확인하기");
  else if (f.verdicts.learning.level === "good") {
    const best = EXECUTION_AREAS.reduce((x, y) =>
      dx.areas[y] > dx.areas[x] ? y : x,
    );
    const prep = lowestArea(f, READINESS_AREAS);
    if (prep)
      out.push(
        `${AREA_NAME[best]}(${dx.areas[best]}점) 강점 유지, 학교생활 준비도 ${AREA_NAME[prep.code]}: ${first(prep.code)}`,
      );
  } else {
    const low = lowestArea(
      f,
      f.verdicts.learning.level === "risk"
        ? [...EXECUTION_AREAS, ...READINESS_AREAS]
        : EXECUTION_AREAS,
    );
    if (low)
      out.push(
        `${AREA_NAME[low.code]}: ${STRATEGIES[low.code][0]}, 이어서 ${STRATEGIES[low.code][1]}`,
      );
  }

  const pending = f.pendingPerformance[0];
  if (pending) {
    out.push(
      `${pending.subject ?? "해당"} 수행평가 피드백을 다음 제출 전 체크리스트로 만들기`,
    );
  } else if (f.metrics.used.growth && f.growthKeywords[0]) {
    out.push(
      `수행평가마다 '${f.growthKeywords[0]}'${hasFinalConsonant(f.growthKeywords[0]) ? "과" : "와"} 연결되는 한 줄 정리`,
    );
  } else {
    out.push("수행평가마다 '교과 개념 + 진로 연결' 한 줄 정리 습관화");
  }
  return out;
}

// ---- 강점과 보완 --------------------------------------------------------------------------

/** 강점 최대 3개(문구표 r133~r137). 위에서부터 첫 일치. */
export function strengths(f: TextFacts): string[] {
  const out: string[] = [];
  const week = f.goal?.week;
  if (f.verdicts.execution.level === "good" && week && f.goal) {
    const streak = f.goal.streak >= 3 ? `, ${f.goal.streak}일 연속` : "";
    out.push(
      `목표시간 달성율 ${pct(ach(f) ?? 0)}%${vs(f, "list")}, 최소 목표시간 ${week.metDays}/${week.setDays}일 충족${streak}`,
    );
  }
  const dx = f.metrics.diagnosis;
  if (dx) {
    const all = [...EXECUTION_AREAS, ...READINESS_AREAS];
    const best = all.reduce((x, y) => (dx.areas[y] > dx.areas[x] ? y : x));
    if (dx.areas[best] >= 80) {
      out.push(
        `${AREA_NAME[best]} ${dx.areas[best]}점(${areaState(best, dx.areas[best])}), 학습진단에서 가장 높은 영역으로 상담의 출발점`,
      );
    }
  }
  const link = f.axes.axes.find((a) => a.key === "careerLink");
  if (f.verdicts.linkage.level === "good" && link?.score != null)
    out.push(`진로 연결도 ${link.score}점`);
  if (out.length < 3 && f.metrics.used.growth && f.growthKeywords.length > 0) {
    out.push(
      `성장설계 키워드(${f.growthKeywords.slice(0, 2).join(", ")})가 정리되어 있음`,
    );
  }
  if (out.length === 0) out.push("아직 뚜렷한 강점 근거가 쌓이지 않았습니다.");
  return out.slice(0, 3);
}

/** 보완 최대 3개(문구표 r138~r149). 위에서부터 첫 일치. */
export function weaknesses(f: TextFacts): string[] {
  const out: string[] = [];
  const week = f.goal?.week;
  const code = f.type.code;
  if (["H", "I", "J", "K"].includes(code)) {
    const key: AxisKey = (
      {
        H: "performance",
        I: "inquiry",
        J: "selfAssessment",
        K: "readiness",
      } as const
    )[code as "H" | "I" | "J" | "K"];
    const axis = f.axes.axes.find((a) => a.key === key);
    if (axis?.score != null && axis.cause) {
      out.push(
        `${axis.name} ${axis.score}점: 6축 중 가장 낮음(원인 ${axis.cause.service} ${axis.cause.name} ${pct(axis.cause.score as number)}점)`,
      );
    }
  }
  const exec = f.verdicts.execution;
  if (!f.metrics.used.goal)
    out.push("목표관리 미이용: 목표대학과 하루 목표시간 설정 필요");
  else if (exec.level === "no_data")
    out.push("최근 7일 목표시간 없음: 하루 목표시간 설정 필요");
  else if (exec.level === "risk" && week && f.goal) {
    const text =
      exec.reason === "미접속"
        ? `최근 ${f.goal.daysSinceLastSeen}일간 미접속`
        : exec.reason === "최소 미충족"
          ? `최소 목표시간 ${week.metDays}/${week.setDays}일 충족${f.goal.lastWeek ? `(지난주 ${f.goal.lastWeek.metDays}일)` : ""}`
          : `목표시간 달성율 ${pct(ach(f) ?? 0)}%${vs(f, "list")}`;
    out.push(`${text}: 습관 회복 필요`);
  } else if (exec.level === "caution" && week) {
    out.push(
      `목표시간 달성율 ${pct(ach(f) ?? 0)}%, 최소 충족 ${week.metDays}/${week.setDays}일: 계획 조정 필요`,
    );
  }
  const dx = f.metrics.diagnosis;
  if (!dx) out.push("학습진단 미실시: 학습 역량 판단 불가");
  else if (
    f.verdicts.learning.level === "caution" ||
    f.verdicts.learning.level === "risk"
  ) {
    const low = lowestArea(f, EXECUTION_AREAS);
    if (low) {
      const rest =
        low.score >= 75 ? "목표 도달" : `목표까지 ${75 - low.score}점`;
      out.push(
        `${AREA_NAME[low.code]} ${low.score}점(${areaState(low.code, low.score)}): 가장 시급한 영역, ${rest}`,
      );
    }
  }
  const prep = lowestArea(f, READINESS_AREAS);
  if (out.length < 3 && prep && prep.score < 60) {
    out.push(
      `학교생활 준비도: ${AREA_NAME[prep.code]} ${prep.score}점(${areaState(prep.code, prep.score)}): ${first(prep.code)}`,
    );
  }
  const link = f.axes.axes.find((a) => a.key === "careerLink");
  if (
    f.verdicts.linkage.level === "risk" ||
    f.verdicts.linkage.level === "caution"
  ) {
    out.push(
      `${withParticle(dept(f), "과", "와")}의 연결 부족(진로 연결도 ${link?.score}점)`,
    );
  } else if (f.verdicts.linkage.level === "no_data") {
    out.push("성장설계, 수행평가, 심화탐구 기록 없음: 진로 연결 확인 불가");
  }
  const pending = f.pendingPerformance[0];
  if (pending?.title || pending?.subject) {
    const more =
      f.pendingPerformance.length >= 2
        ? ` 외 ${f.pendingPerformance.length - 1}건`
        : "";
    out.push(
      `피드백 대기 수행평가 '${pending.title ?? pending.subject}'${more}`,
    );
  }
  if (out.length === 0)
    out.push("뚜렷한 보완점은 없습니다. 월 1회 상태 유지를 점검하세요.");
  return out.slice(0, 3);
}

// ---- 종합 진단 상담 포인트 ------------------------------------------------------------------

const EXCLUDED_AXIS: Record<string, AxisKey> = {
  C1: "execution",
  C2: "execution",
  C3: "execution",
  D1: "execution",
  D2: "execution",
  E1: "execution",
  E2: "execution",
  F1: "careerLink",
  F2: "careerLink",
  H: "performance",
  I: "inquiry",
  J: "selfAssessment",
  K: "readiness",
};

/** 70점 미만 축의 상담 포인트 최대 2개(문구표 r159~r177). 한줄 진단이 다룬 축은 뺀다. */
export function counselPoints(f: TextFacts): string[] {
  const excluded = EXCLUDED_AXIS[f.type.code];
  const under = f.axes.axes
    .filter(
      (a): a is AxisResult & { score: number } =>
        a.status === "scored" && (a.score as number) < 70 && a.key !== excluded,
    )
    .sort((a, b) => a.score - b.score);
  const out: string[] = [];
  for (const axis of under) {
    const counsel = counselFor(axis.causeKey, f);
    if (!counsel || !axis.cause) continue;
    out.push(
      `${axis.name} ${axis.score}점, 원인 ${axis.cause.service} ${axis.cause.name} ${pct(axis.cause.score as number)}점: ${counsel}`,
    );
    if (out.length === 2) break;
  }
  return out;
}

/** 성적 입력값 확인(문구표 r178). 0.5등급 이상 차이일 때만. */
export function gradeInputCheck(f: TextFacts): string | null {
  const g = f.gradeCheck;
  if (!g) return null;
  const diff = Math.abs(g.diagnosis - g.goalInput);
  if (diff < 0.5) return null;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `성적 입력값 확인: 학습진단 평균 내신 ${r(g.diagnosis)}등급과 목표관리 입력 내신 ${r(g.goalInput)}등급이 ${r(diff)}등급 다릅니다. 최근 성적표로 두 서비스 입력값을 함께 확인`;
}

/** 대입 평가 관점 보완 역량(문구표 r179): 발전가능성 50 미만, 그 밖 60 미만 중 가장 낮은 하나. */
export function competencyGap(f: TextFacts): string | null {
  const low = f.competencies
    .filter(
      (c): c is Competency & { score: number } =>
        c.score !== null && c.score < (c.key === "potential" ? 50 : 60),
    )
    .sort((a, b) => a.score - b.score)[0];
  if (!low?.lowest) return null;
  return `대입 평가 관점 보완 역량: ${low.name} ${low.score}점, 가장 낮은 근거 ${low.lowest.service} ${low.lowest.name} ${pct(low.lowest.score as number)}점`;
}

// ---- 목표관리 상담 의견 ---------------------------------------------------------------------

const DISTRACTION_ADVICE: Record<string, string> = {
  스마트폰: "공부 시간에는 휴대폰을 다른 공간에 두는 규칙 정하기",
  학원과제: "학원 과제 시간을 목표시간에 포함해 이상 목표시간 다시 잡기",
  수면부족: "취침 시각을 먼저 고정하고 그 안에서 목표시간 배치하기",
  동아리행사: "행사 주간은 최소 목표시간만 지키는 주로 미리 정하기",
  컨디션: "컨디션이 나쁜 날의 최소 학습량을 따로 정해 두기",
  친구약속: "약속이 있는 날은 약속 전에 최소 목표시간 먼저 채우기",
  게임: "게임은 최소 목표시간을 채운 뒤로 순서 정하기",
};

const md = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const ratio = (d: GoalDay) => (d.actual / d.ideal) * 100;

export interface GoalOpinion {
  summary: string;
  details: {
    recordFlow: string;
    weekdayPattern: string;
    distractions: string;
    questions: string[];
  } | null;
}

/** 목표관리 상담 의견(문구표 r150~r158)과 상세(r185~r201). 미이용과 목표 없음은 한 줄만. */
export function goalOpinion(f: TextFacts): GoalOpinion | null {
  const exec = f.verdicts.execution;
  if (!f.metrics.used.goal) {
    return {
      summary:
        "목표관리를 아직 시작하지 않았습니다. 이상, 최소 목표대학과 하루 목표시간 설정부터 안내하세요.",
      details: null,
    };
  }
  const g = f.goal;
  if (!g) return null;
  if (exec.level === "no_data") {
    return {
      summary:
        "최근 7일 동안 설정된 목표시간이 없습니다. 하루 이상, 최소 목표시간이 생성되는지부터 함께 확인하세요.",
      details: null,
    };
  }
  const a = pct(ach(f) ?? 0);
  const { setDays: set, metDays: met } = g.week;
  let summary: string;
  if (exec.level === "risk") {
    summary =
      exec.reason === "미접속"
        ? `최근 ${g.daysSinceLastSeen}일간 접속 기록이 없습니다. 실행이 어려웠던 이유를 학생 말로 먼저 듣고, 최소 목표시간만 지키는 것부터 다시 시작하세요.`
        : exec.reason === "최소 미충족"
          ? `최근 7일 목표일 ${set}일 중 최소 목표시간을 ${met}일만 지켰습니다${g.lastWeek ? `(지난주 ${g.lastWeek.metDays}일)` : ""}. 이상 목표보다 최소 목표를 매일 지키는 약속을 먼저 하세요.`
          : `목표시간 달성율이 ${a}%${vs(f, "paren")}로 낮습니다. 이상 목표시간이 현실보다 높게 잡혔는지 함께 점검하세요.`;
  } else if (exec.level === "caution") {
    summary = `목표시간 달성율 ${a}%${vs(f, "list")}, 최소 목표시간 충족 ${met}/${set}일입니다. ${a < 70 ? "밀리는 과목, 시간대를 함께 찾아 계획을 조정하세요." : "못 지킨 요일을 함께 찾아 그날 일정을 조정하세요."}`;
  } else {
    summary =
      g.streak >= 3
        ? `실행이 안정적입니다(달성율 ${a}%${vs(f, "list")}, ${g.streak}일 연속 최소 목표 충족). 연속 기록 칭찬으로 시작하고, 늘어난 여유 시간은 심화탐구로 옮기도록 안내하세요.`
        : `실행이 안정적입니다(달성율 ${a}%${vs(f, "list")}). 최근 연속 기록이 끊겼으니 다시 이어갈 방법을 함께 정하세요.`;
  }

  const setDays = g.days.filter((d) => d.weekday !== "sun" && d.ideal > 0);
  const sunday = g.days
    .filter((d) => d.weekday === "sun")
    .reduce((s, d) => s + d.actual, 0);
  const idealSum = setDays.reduce((s, d) => s + d.ideal, 0);
  const streakText =
    g.streak >= 3 ? "(유지 중)" : g.streak === 0 ? "(최근 목표일에 끊김)" : "";
  const sundayText =
    sunday > 0
      ? ` 일요일에 ${Math.round(sunday * 10) / 10}시간 더 공부해 주간 달성율에 ${Math.round((sunday / idealSum) * 100)}%p가 더해졌습니다.`
      : "";
  const recordFlow = `최소 목표시간 충족 ${g.lastWeek ? `지난주 ${g.lastWeek.metDays}일, ` : ""}이번 주 ${met}/${set}일, 연속 기록 ${g.streak}일${streakText}.${sundayText}`;

  const missed = setDays.filter((d) => d.actual < d.min).reverse();
  const worst = setDays.reduce((x, y) => (ratio(y) <= ratio(x) ? y : x));
  const best = setDays.reduce((x, y) => (ratio(y) > ratio(x) ? y : x));
  const sat = setDays.find((d) => d.weekday === "sat");
  const weekdays = setDays.filter((d) => d.weekday !== "sat");
  const weekdayAvg = weekdays.length
    ? weekdays.reduce((s, d) => s + ratio(d), 0) / weekdays.length
    : null;
  const satGap =
    sat && weekdayAvg !== null ? Math.round(ratio(sat) - weekdayAvg) : 0;
  const missedText = missed.length
    ? `최소 목표시간을 못 지킨 날: ${missed.map((d) => `${WEEKDAY_NAME[d.weekday]}(${md(d.date)})`).join(", ")}`
    : `목표일 ${set}일 모두 최소 목표시간을 지켰습니다`;
  const satText =
    Math.abs(satGap) >= 20
      ? `. 토요일 달성율이 월~금 평균보다 ${Math.abs(satGap)}%p ${satGap < 0 ? "낮습니다" : "높습니다"}`
      : "";
  const weekdayPattern = `${missedText}. 가장 적게 한 날 ${WEEKDAY_NAME[worst.weekday]}(이상 목표의 ${pct(ratio(worst))}%), 가장 많이 한 날 ${WEEKDAY_NAME[best.weekday]}(${pct(ratio(best))}%)${satText}.`;

  const counts = new Map<string, number>();
  for (const r of g.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  const ranked = [...counts].sort((x, y) => y[1] - x[1]);
  const distractions = ranked.length
    ? `학생이 기록한 방해 요인: ${ranked.map(([name, n]) => `${name} ${n}회`).join(", ")}.`
    : "이번 주 기록된 방해 요인이 없습니다. 방해 요인을 함께 기록하도록 안내하세요.";

  const questions: string[] = [];
  if (exec.reason === "미접속" && g.daysSinceLastSeen !== null) {
    questions.push(
      `마지막 기록 이후 ${g.daysSinceLastSeen}일 동안 무슨 일이 있었는지 먼저 묻기`,
    );
  } else if (missed.length) {
    const names = missed.map((d) => WEEKDAY_NAME[d.weekday]).join(", ");
    questions.push(
      `${names}에 반복되는 일정이 있는지 묻고, 그날 최소 목표시간을 하루 첫 일정으로 옮기기`,
    );
  }
  if (satGap <= -20) questions.push("토요일 학습 시작 시각을 미리 정해 두기");
  const top = ranked[0]?.[0];
  const advice = top
    ? DISTRACTION_ADVICE[top.replace(/[^가-힣]/g, "")]
    : undefined;
  if (top && advice) questions.push(`방해 요인 1위 '${top}': ${advice}`);
  if (questions.length === 0)
    questions.push("지금 패턴을 유지하며 남는 시간을 심화탐구에 배정");

  return {
    summary,
    details: { recordFlow, weekdayPattern, distractions, questions },
  };
}

// ---- 서비스별 요약 카드 --------------------------------------------------------------------

export interface ServiceCard {
  service:
    | "diagnosis"
    | "goal"
    | "growth"
    | "performance"
    | "selfeval"
    | "inquiry";
  name: string;
  state: "using" | "not_joined" | "no_goal";
  chip: string;
  tone: "neutral" | "success" | "warning";
  value: string;
  detail: string;
}

const FIT_NAME = { fit: "맞음", normal: "보통", off: "어긋남" } as const;

/** 서비스별 요약 카드 6장(교 #62). 쓰지 않는 서비스는 "서비스 이용 전", 목표를 못 읽으면 "목표 미설정". */
export function serviceCards(f: TextFacts): ServiceCard[] {
  const m = f.metrics;
  const card = (
    service: ServiceCard["service"],
    name: string,
    over: Partial<ServiceCard> = {},
  ): ServiceCard =>
    m.used[service]
      ? {
          service,
          name,
          state: "using",
          chip: "이용 중",
          tone: "neutral",
          value: "",
          detail: "",
          ...over,
        }
      : {
          service,
          name,
          state: "not_joined",
          chip: "서비스 이용 전",
          tone: "neutral",
          value: "",
          detail: "",
        };

  const dx = m.diagnosis;
  const low = lowestArea(f, EXECUTION_AREAS);
  const prep = dx
    ? Math.round(
        READINESS_AREAS.reduce((s, c) => s + dx.areas[c], 0) /
          READINESS_AREAS.length,
      )
    : null;
  const execAvg = dx
    ? Math.round(
        EXECUTION_AREAS.reduce((s, c) => s + dx.areas[c], 0) /
          EXECUTION_AREAS.length,
      )
    : null;
  const week = f.goal?.week;
  const level = f.verdicts.execution.level;
  const pending = f.pendingPerformance.length;
  const confirmed = m.growth
    ? Object.values(m.growth.axes).filter((a) => a?.verdict === "confirmed")
        .length
    : 0;

  return [
    card("diagnosis", "학습진단", {
      chip: "진단 완료",
      value: dx ? `긴급도 ${URGENCY_NAME[urgencyOf(dx.areas)]}` : "",
      detail:
        dx && low && execAvg !== null && prep !== null
          ? `학습 실행 역량 ${execAvg}점, 학교생활 준비도 ${prep}점, 가장 시급한 영역 ${AREA_NAME[low.code]}(${low.score}점)`
          : "",
    }),
    week && week.setDays > 0 && f.goal
      ? card("goal", "목표관리", {
          chip:
            level === "good" ? "양호" : level === "caution" ? "주의" : "위험",
          tone: level === "good" ? "success" : "warning",
          value: `달성율 ${pct(ach(f) ?? 0)}%`,
          detail: `최소 목표시간 충족 ${week.metDays}일 / 목표 설정 ${week.setDays}일, 연속 기록 ${f.goal.streak}일`,
        })
      : m.used.goal
        ? {
            ...card("goal", "목표관리"),
            state: "no_goal",
            chip: "목표 미설정",
            value: "목표 미설정",
            detail: "하루 이상, 최소 목표시간 설정부터 안내하세요",
          }
        : card("goal", "목표관리"),
    card("growth", "성장설계", {
      value: f.growthKeywords[0] ?? "",
      detail: m.growth ? `5개 축 중 ${confirmed}개 확인됨` : "",
    }),
    card("performance", "수행평가", {
      chip: pending > 0 ? "피드백 대기" : "이용 중",
      tone: pending > 0 ? "warning" : "neutral",
      value: `제출 ${m.performance?.tasks ?? 0}건`,
      detail: `피드백 대기 ${pending}건`,
    }),
    card("selfeval", "자기평가", {
      value:
        m.selfeval?.verifyScore != null
          ? `검증 ${Math.round(m.selfeval.verifyScore)}점`
          : "검증 전",
    }),
    card("inquiry", "심화탐구", {
      value: f.inquiryTopic ?? "주제 탐색중",
      detail: m.inquiry?.topicFit
        ? `주제 적합도 ${FIT_NAME[m.inquiry.topicFit]}`
        : "",
    }),
  ];
}

// ---- 한꺼번에 -----------------------------------------------------------------------------

export function buildCoachingText(f: TextFacts) {
  return {
    priorityTask: priorityTask(f),
    points: counselPoints(f),
    gradeInputCheck: gradeInputCheck(f),
    competencyGap: competencyGap(f),
    strengths: strengths(f),
    weaknesses: weaknesses(f),
    careerPlan: careerPlan(f),
    studyMethods: studyMethods(f),
    goalOpinion: goalOpinion(f),
    serviceCards: serviceCards(f),
  };
}
