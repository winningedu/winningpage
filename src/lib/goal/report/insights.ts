// 목표관리 리포트 자연어 슬롯 — 규칙 기반 전용(D9/D11, "멘토 덮어쓰기는 후속" 결정).
//
// 이 파일은 aggregate.js 가 계산한 숫자/구조를 받아 조건 분기 + 템플릿 문자열만 채운다.
// LLM 호출도, 저장된 카피도 없다 — 같은 입력이면 항상 같은 문장이 나온다(테스트 가능성).
//
// 학생 이름을 언급하지 않는다 — goal_students 스키마에 표시 이름 컬럼이 없다(sql/55 §"학적"
// 절 실측). 원본 목업(goalReportMock.js)의 "김주원 학생, ..." 서두는 이 스키마로는 만들 수
// 없는 문장이라 이식하지 않는다(판단 지점).

import { round1 } from "./aggregate.js";

// 아래 타입들은 aggregate.ts 가 실제로 만드는 값 shape 을 이 파일이 쓰는 필드만 최소로
// 옮겨 적은 것이다(호출부 report.ts 는 두 모듈을 그대로 이어붙여 호출하므로 구조적
// 호환이면 충분하다 — GrowthReport.tsx 등 기존 호출부의 "로컬 재선언" 관례와 동일).
interface LabeledValue {
  label: string;
  value: number;
}

interface SubjectShare {
  empty: boolean;
  rows: LabeledValue[];
}

interface TimeSlotBucket {
  label: string;
  value: number;
}

interface MonthlyWeekLike {
  weekLabel: string;
  minRate: number;
}

type GoalDirectionZone = "strong" | "improve" | "focus";

interface DirectionSubject {
  name: string;
  zone: GoalDirectionZone;
  grade?: number;
  percentile?: number;
}

// ---------------------------------------------------------------------------
// 히어로 카드 문단
// ---------------------------------------------------------------------------

function formatHoursMinutes(hoursFloat: number): string {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간${m}분`;
}

/** 'YYYY-MM-DD' → 'YYYY.M.D'(월/일 0 없이, 고객사 요청 문구 표기). */
function formatYmdDot(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}.${m}.${d}`;
}

/** 성장 리포트 히어로 문단. period='weekly'|'monthly'. */
export function buildHeroNarrative({
  period,
  totalStudyHours,
  idealRate,
  minRate,
  completionScore,
  recordDays,
  elapsedDays,
  periodStart,
  periodEnd,
  nowYmd,
}: {
  period: "weekly" | "monthly";
  totalStudyHours: number;
  idealRate: number;
  minRate: number;
  completionScore: number;
  recordDays: number;
  elapsedDays: number;
  periodStart: string;
  periodEnd: string;
  nowYmd: string;
}): string {
  const periodWord = period === "monthly" ? "이번 달" : "이번 주";
  const timeLabel = formatHoursMinutes(totalStudyHours);

  if (elapsedDays <= 0) {
    return `${periodWord} 리포트 기간이 아직 시작되지 않았거나 학습 시작일 이전입니다. 기록이 쌓이면 리포트가 갱신됩니다.`;
  }

  if (recordDays <= 0) {
    const isPast = periodEnd < nowYmd;
    const emptyPeriodWord =
      period === "monthly"
        ? isPast
          ? "지난달"
          : "이번 달"
        : isPast
          ? "지난주"
          : "이번 주";
    const range = `${formatYmdDot(periodStart)}~${formatYmdDot(periodEnd)}`;
    return `${emptyPeriodWord}(${range}) 학습목표 또는 실행내역의 입력 내용이 없습니다. 학습목표의 관리를 위해서는 지속적인 목표관리 체크 및 현황 입력이 중요합니다.`;
  }

  const toneSentence =
    completionScore >= 80
      ? `${periodWord}도 잘 해냈습니다!`
      : completionScore >= 50
        ? `${periodWord} 꾸준히 이어가고 있습니다.`
        : `${periodWord} 기록·달성률을 조금 더 끌어올릴 여지가 있습니다.`;

  return `${toneSentence} ${periodWord} 총 공부 시간은 ${timeLabel}입니다. 최소 목표 달성률은 ${minRate}%, 이상 목표 달성률은 ${idealRate}%입니다.`;
}

// ---------------------------------------------------------------------------
// 카드 하단 InsightBox 팁 — 카드별로 1개씩(variant 4종: info/warn/success/time)
// ---------------------------------------------------------------------------

export type InsightTip = {
  variant: "info" | "warn" | "success" | "time";
  text: string;
};

/** 과목별(타이머) 학습 비중 카드 팁. */
export function buildSubjectShareTip(subjectShare: SubjectShare): InsightTip {
  if (subjectShare.empty) {
    return {
      variant: "info",
      text: "타이머 과목 데이터가 아직 충분히 누적되지 않아 과목별 학습 균형 판단은 보류합니다.",
    };
  }
  // subjectShare.empty === false ⇒ rows.length > 0 (aggregate.ts 가 보장하는 불변식)
  const top = subjectShare.rows[0]!;
  const weakest = subjectShare.rows[subjectShare.rows.length - 1]!;
  if (subjectShare.rows.length < 2) {
    return {
      variant: "info",
      text: `${top.label} 비중이 ${top.value}%로 가장 높습니다. 다른 과목의 타이머 기록이 더 쌓이면 균형 판단이 정확해집니다.`,
    };
  }
  return {
    variant: "info",
    text: `${top.label} 비중이 ${top.value}%로 가장 높습니다. 상대적으로 비중이 낮은 ${weakest.label}(${weakest.value}%)에 시간을 조금 더 배분하면 균형이 개선됩니다.`,
  };
}

/** 시간대별 학습 효율 카드 팁. */
export function buildTimeSlotTip(buckets: TimeSlotBucket[]): InsightTip {
  const total = buckets.reduce((s, b) => s + b.value, 0);
  if (total <= 0) {
    return {
      variant: "info",
      text: "아직 축적된 타이머 학습 시간대 데이터가 없습니다.",
    };
  }
  // total > 0 체크(위)를 통과 ⇒ buckets 는 비어있지 않음
  const top = buckets.reduce(
    (best, b) => (b.value > best.value ? b : best),
    buckets[0]!,
  );
  return {
    variant: "info",
    text: `${top.label}시가 가장 긴 시간대입니다. 이 시간에 핵심 과목을 배치하면 루틴 안정성이 높아집니다.`,
  };
}

/** 학습 방해요인 분석 카드 팁. */
export function buildDistractionTip(rows: LabeledValue[]): InsightTip {
  if (rows.length === 0) {
    return {
      variant: "success",
      text: "이번 기간 기록된 방해요인이 없습니다. 지금의 학습 환경을 유지해도 좋습니다.",
    };
  }
  // rows.length === 0 케이스는 위에서 early return
  const top = rows[0]!;
  return {
    variant: "warn",
    text: `${top.label} 요인이 반복적으로 나타났습니다. 다음 기간에는 해당 요인이 발생하는 시간대와 과목을 함께 확인해 학습 환경을 조정할 필요가 있습니다.`,
  };
}

/** 완료한 핵심 학습 항목 카드 팁. */
export function buildCoreItemsTip(rows: LabeledValue[]): InsightTip {
  if (rows.length === 0) {
    return {
      variant: "success",
      text: "이번 기간 완료 기록이 아직 없습니다. 기록을 남기면 학습 항목 균형을 확인할 수 있습니다.",
    };
  }
  const total = rows.reduce((s, r) => s + r.value, 0);
  // rows.length === 0 케이스는 위에서 early return
  const top = rows[0]!;
  const topShare = Math.round((top.value / total) * 100);
  if (rows.length === 1 || topShare >= 70) {
    return {
      variant: "success",
      text: `${top.label} 항목이 전체 기록의 ${topShare}%를 차지합니다. 특정 학습 방식에 치우친 흐름이므로, 다음 기간에는 여러 학습 방식이 함께 이어지도록 조정할 필요가 있습니다.`,
    };
  }
  return {
    variant: "success",
    text: `${rows.map((r) => r.label).join("·")}이(가) 함께 이어졌습니다. 이 균형을 유지하면 좋습니다.`,
  };
}

interface ConditionTile {
  label: string;
  value: string;
  avg: string;
}

/** 컨디션별 학습량 카드 팁. */
export function buildConditionTip(tiles: ConditionTile[]): InsightTip {
  const withData = tiles.filter((t) => t.value !== "0일");
  if (withData.length === 0) {
    return { variant: "time", text: "이번 기간 컨디션 기록이 아직 없습니다." };
  }
  const parseAvg = (avg: string) =>
    Number(String(avg).replace(/[^0-9.]/g, "")) || 0;
  const best = withData.reduce((a, b) =>
    parseAvg(b.avg) > parseAvg(a.avg) ? b : a,
  );
  const worst = withData.reduce((a, b) =>
    parseAvg(b.avg) < parseAvg(a.avg) ? b : a,
  );
  if (best.label === worst.label || parseAvg(worst.avg) <= 0) {
    return {
      variant: "time",
      text: `컨디션 "${best.label}"인 날의 평균 공부 시간이 ${best.avg}입니다. 컨디션 관리가 학습량에 영향을 줍니다.`,
    };
  }
  const ratio = round1(parseAvg(best.avg) / parseAvg(worst.avg));
  return {
    variant: "time",
    text: `컨디션이 "${best.label}"인 날의 평균 공부 시간이 "${worst.label}"인 날의 약 ${ratio}배입니다. 컨디션을 일정하게 유지하는 것이 총 학습량에 가장 큰 영향을 줍니다.`,
  };
}

// ---------------------------------------------------------------------------
// 월간 전용 — 학습 유형 진단 / 다음 달 관리 전략 / 기대 효과
// ---------------------------------------------------------------------------

/** 월간 학습 유형 진단(LearningTypeCard). */
export function buildMonthlyLearningType({
  idealRate,
  minRate,
  recordDays,
  elapsedDays,
  bestWeek,
}: {
  idealRate: number;
  minRate: number;
  recordDays: number;
  elapsedDays: number;
  bestWeek: MonthlyWeekLike | null | undefined;
}): { badge: string; body: string } {
  const consistencyRatio = elapsedDays > 0 ? recordDays / elapsedDays : 0;
  const isConsistent = consistencyRatio >= 0.7;
  const isVolumeShort = minRate < 100;

  let badge: string;
  if (isConsistent && isVolumeShort) badge = "기록안정·총량보완형";
  else if (isConsistent) badge = "기록안정·목표달성형";
  else if (isVolumeShort) badge = "총량보완·루틴형성형";
  else badge = "고성과형";

  const bestWeekSentence = bestWeek
    ? ` ${bestWeek.weekLabel} 수준(${bestWeek.minRate}%)을 기준으로 총량을 끌어올리는 단계입니다.`
    : "";

  const body = isConsistent
    ? `기록이 꾸준히 이어졌지만 최소 목표 달성률은 ${minRate}%로 아직 목표선 ${isVolumeShort ? "아래" : "위"}입니다.${bestWeekSentence}`
    : `기록이 기간의 ${Math.round(consistencyRatio * 100)}%만 이어졌습니다. 이상 목표 달성률 ${idealRate}%를 유지하려면 기록 루틴부터 안정시켜야 합니다.`;

  return { badge, body };
}

/** 다음 달 관리 전략(StrategyListCard) — 방해요인·주차별 흐름에서 상위 이슈를 뽑아 행동 항목으로. */
export function buildMonthlyStrategy({
  distraction,
  weeks,
  minTargetHours,
}: {
  distraction: LabeledValue[];
  weeks: MonthlyWeekLike[];
  minTargetHours: number;
}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  if (minTargetHours > 0) {
    rows.push({
      label: "핵심 과목 주간 최소 목표 시간 유지",
      value: `주 ${round1(minTargetHours)}시간`,
    });
  }

  if (distraction.length > 0) {
    rows.push({
      // length > 0 체크(위)를 통과
      label: `${distraction[0]!.label} 발생 시간대 미리 점검하기`,
      value: "주 1회 이상",
    });
  }

  const worstWeek =
    weeks.length > 0
      ? weeks.reduce((a, b) => (b.minRate < a.minRate ? b : a))
      : null;
  if (worstWeek) {
    rows.push({
      label: `${worstWeek.weekLabel} 수준 재발 방지 — 일정 미리 비워 두기`,
      value: "월 시작 전",
    });
  }

  if (rows.length === 0) {
    rows.push({
      label: "다음 달도 지금의 학습 루틴을 유지하기",
      value: "계속",
    });
  }

  return rows;
}

/** 기대 효과(ExpectedEffectCard). */
export function buildMonthlyExpectedEffect({
  subjectShare,
  idealRate,
}: {
  subjectShare: SubjectShare;
  idealRate: number;
}): { pills: string[]; caption: string } {
  const pills: string[] = [];
  if (subjectShare.rows.length > 0) pills.push("과목 균형 개선");
  pills.push(idealRate >= 100 ? "성과 확대" : "루틴 안정화");
  pills.push("공백 감소");

  const weakest = subjectShare.rows[subjectShare.rows.length - 1];
  const caption = weakest
    ? `${weakest.label} 비중을 끌어올리면 목표 대비 격차가 가장 빠르게 줄어듭니다.`
    : "학습 기록이 쌓일수록 더 정확한 다음 달 전략을 제시할 수 있습니다.";

  return { pills, caption };
}

// ---------------------------------------------------------------------------
// 학습방향 리포트(#37/#38) — 진단 배너 + 과목별 공부 방향
// ---------------------------------------------------------------------------

/** 요약 배너 typeLabel — 구간별 과목 수로 유형명을 짓는다. */
function buildDirectionTypeLabel(subjects: DirectionSubject[]): string {
  const focusSubjects = subjects.filter((s) => s.zone === "focus");
  if (focusSubjects.length === 0) return "균형 유지형";
  // length === 1 체크(위)를 통과
  if (focusSubjects.length === 1)
    return `${focusSubjects[0]!.name} 집중 보완형`;
  return `${focusSubjects.map((s) => s.name).join("・")} 집중 보완형`;
}

/**
 * 학습방향 리포트 요약 배너(summary.typeLabel/body). track='naesin'|'jeongsi'.
 * avgValue 는 종합 평균(내신=등급, 정시=백분위) — 스케일이 track마다 반대 방향(내신은
 * 낮을수록, 정시는 높을수록 우세)이라 gap 부호·문장은 이 함수 안에서 track으로 분기한다.
 * idealCut/minCut 은 온보딩 시 저장된 목표 컷(status='active'면 항상 존재 — student.js
 * 게이트 참고, 그래도 null 방어는 유지한다).
 */
export function buildDirectionSummary({
  track,
  subjects,
  avgValue,
  idealCut,
  minCut,
}: {
  track: "naesin" | "jeongsi";
  subjects: DirectionSubject[];
  avgValue: number;
  idealCut: number | null | undefined;
  minCut: number | null | undefined;
}): { typeLabel: string; body: string } {
  const typeLabel = buildDirectionTypeLabel(subjects);
  const worst =
    track === "naesin"
      ? subjects.reduce((a, b) => ((b.grade ?? 0) > (a.grade ?? 0) ? b : a))
      : subjects.reduce((a, b) =>
          (b.percentile ?? 0) < (a.percentile ?? 0) ? b : a,
        );

  const allBelowIdeal = subjects.every((s) => s.zone !== "strong");
  const spreadSentence = allBelowIdeal
    ? "과목군 간 편차는 크지 않지만 전 과목군이 목표선 아래입니다."
    : "과목군별로 목표 대비 편차가 있습니다.";

  const worstDesc =
    track === "naesin"
      ? `${worst.name}(${round1(worst.grade).toFixed(1)})`
      : `${worst.name}(백분위 ${round1(worst.percentile)})`;

  let gapSentence: string;
  if (track === "naesin") {
    const gap = minCut != null ? round1(Math.max(0, avgValue - minCut)) : null;
    gapSentence =
      gap == null
        ? ""
        : gap > 0
          ? // gap>0 ⇒ gap!=null ⇒ minCut!=null (위 계산에서 파생)
            `최소 목표 ${minCut!.toFixed(2)}등급까지 ${gap}등급 남았고, `
          : "최소 목표선은 이미 넘었고, ";
  } else {
    const gap =
      idealCut != null ? round1(Math.max(0, idealCut - avgValue)) : null;
    gapSentence =
      gap == null
        ? `종합 백분위 ${avgValue}입니다. `
        : `종합 백분위 ${avgValue}로 이상 목표 ${idealCut}까지 ${gap} 부족합니다. `;
  }

  const closingSentence =
    track === "naesin"
      ? "을(를) 먼저 끌어올리는 것이 평균 개선에 가장 효과적입니다."
      : "에서 격차가 가장 큽니다.";

  return {
    typeLabel,
    body: `${spreadSentence} ${gapSentence}${worstDesc}${closingSentence}`,
  };
}

/** 과목(군)별 공부 방향 본문(SubjectDirectionCard.body) — 구간별 정형 문장, 도메인 콘텐츠(교재 추천)는 다루지 않는다(D13). */
export function buildSubjectDirectionBody(subject: DirectionSubject): string {
  if (subject.zone === "strong") {
    return `${subject.name}은(는) 목표선 위에서 안정적으로 유지되고 있습니다. 지금 수준을 유지하면서 다른 과목에 시간을 더 배분해도 좋습니다.`;
  }
  if (subject.zone === "improve") {
    return `${subject.name}은(는) 최소 목표는 넘었지만 이상 목표에는 아직 못 미칩니다. 취약 단원 위주로 보완하면 목표선에 가까워집니다.`;
  }
  return `${subject.name}은(는) 아직 최소 목표선에 미치지 못합니다. 다른 과목보다 우선적으로 시간을 배분해 기초부터 다시 다지는 것이 필요합니다.`;
}
