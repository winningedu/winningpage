// 성장설계 "방향 일관성" 지표(명세 No.59~62, 103, 149 / 시안 1-10).
// 순수 함수만 담는다. DB/네트워크 의존 없음.

/** 사용자 노출 명칭(고정). */
export const CONSISTENCY_LABEL = "방향 일관성";

/** 연결 신호: 과목 간 연계, 학년 간 연계, 축 일치(No.62). */
export type LinkSignal = "subject_link" | "grade_link" | "axis_match";

export type ConsistencyActivity = {
  id: string;
  signals: LinkSignal[];
  evidence?: string;
};

export type ConsistencyVerdict = "clear" | "splitting" | "scattered";

export type ConsistencyResult = {
  percent: number | null;
  linked: number;
  total: number;
  formula: string;
  verdict: ConsistencyVerdict | null;
  verdictLabel: string | null;
  criteria: string;
  smallSample: boolean;
};

/** 판정 구간 경계(No.60). 경계값은 상위 구간. */
const CLEAR_MIN = 60;
const SPLITTING_MIN = 35;

const VERDICT_LABEL: Record<ConsistencyVerdict, string> = {
  clear: "뚜렷함",
  splitting: "갈리는 중",
  scattered: "흩어짐",
};

/** 연결 비율(%) 을 소수 첫째 자리로 반올림한다(No.59). */
function toPercent(linked: number, total: number): number {
  return Math.round((linked / total) * 1000) / 10;
}

function judge(percent: number): ConsistencyVerdict {
  if (percent >= CLEAR_MIN) return "clear";
  if (percent >= SPLITTING_MIN) return "splitting";
  return "scattered";
}

/** 판정 기준 안내 문구(고정). */
const CRITERIA =
  "60% 이상 뚜렷함 / 35% 이상 60% 미만 갈리는 중 / 35% 미만 흩어짐";

/** 표본이 이 값 미만이면 해석에 한계가 있다고 표시한다(No.149). */
const SMALL_SAMPLE_BELOW = 5;

/** 신호가 하나 이상인 활동 수. 다중 신호도 1건으로만 센다(No.62). */
export function countLinked(activities: ConsistencyActivity[]): number {
  return activities.filter((a) => a.signals.length > 0).length;
}

export function computeConsistency(
  activities: ConsistencyActivity[],
): ConsistencyResult {
  const total = activities.length;
  const linked = countLinked(activities);
  const base = {
    linked,
    total,
    criteria: CRITERIA,
    smallSample: total < SMALL_SAMPLE_BELOW,
  };
  if (total === 0) {
    return { ...base, percent: null, formula: "", verdict: null, verdictLabel: null };
  }
  const percent = toPercent(linked, total);
  const verdict = judge(percent);
  return {
    ...base,
    percent,
    // 계산 근거 병기(No.61)
    formula: `연결 활동 ${linked}건 ÷ 전체 ${total}건 × 100 = ${percent}%`,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
  };
}

/** 대표 신호 우선순위: 축 일치 > 과목 간 > 학년 간(시안 1-10). */
const SIGNAL_PRIORITY: LinkSignal[] = ["axis_match", "subject_link", "grade_link"];

export type LinkedBreakdownItem = {
  id: string;
  primarySignal: LinkSignal;
  signals: LinkSignal[];
};

/** 연결로 센 활동 목록(시안 1-10 "연결로 센 활동" 표용). */
export function linkedBreakdown(
  activities: ConsistencyActivity[],
): LinkedBreakdownItem[] {
  const items: LinkedBreakdownItem[] = [];
  for (const a of activities) {
    const primarySignal = SIGNAL_PRIORITY.find((s) => a.signals.includes(s));
    if (primarySignal === undefined) continue;
    items.push({ id: a.id, primarySignal, signals: a.signals });
  }
  return items;
}

export type ConsistencyProjection = {
  percent: number | null;
  verdict: ConsistencyVerdict | null;
};

/**
 * 완료 시 변화 예측(No.103).
 * 새 활동이 생기는 것이므로 전체도 additionalLinked 만큼 늘어난다고 본다.
 */
export function projectConsistency(
  current: { linked: number; total: number } | null,
  additionalLinked: number,
): ConsistencyProjection | null {
  if (current === null) return null;
  const total = current.total + additionalLinked;
  if (total === 0) return { percent: null, verdict: null };
  const percent = toPercent(current.linked + additionalLinked, total);
  return { percent, verdict: judge(percent) };
}
