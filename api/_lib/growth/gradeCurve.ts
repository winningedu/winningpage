// 성장설계 성적 곡선 판정·보정(No.61·76·77). 순수 함수만.
export type GradeSystem = "five" | "nine";
export type CurveVerdict = "rising" | "falling" | "flat" | "not_judgeable";

export type SemesterAverage = { key: string; average: number | null };

export type CurveJudgement = {
  verdict: CurveVerdict;
  delta: number | null;
  from: number | null;
  to: number | null;
  threshold: number;
  basis: string;
};

const THRESHOLD: Record<GradeSystem, number> = { nine: 0.5, five: 0.25 };

const round2 = (n: number): number => Math.round(n * 100) / 100;

// 학기 키 "고1-1" 에서 학년 숫자(1~3)를 꺼낸다. 형식이 다르면 null.
function gradeLevelOf(key: string): number | null {
  const m = /^고(\d)-/.exec(key);
  return m ? Number(m[1]) : null;
}

export function judgeCurve(input: {
  system: GradeSystem;
  semesterAverages: SemesterAverage[];
}): CurveJudgement {
  const threshold = THRESHOLD[input.system];
  const notJudgeable: CurveJudgement = {
    verdict: "not_judgeable",
    delta: null,
    from: null,
    to: null,
    threshold,
    basis: "학기가 2개 이하이거나 학년이 하나뿐이라 추세 판정 불가",
  };

  // null 평균 학기는 무시한다.
  const valid = input.semesterAverages.filter(
    (s): s is { key: string; average: number } => s.average !== null,
  );
  // No.76: 학기 2개 이하이면 곡선 판정 안 함
  if (valid.length <= 2) return notJudgeable;

  // 학년별 평균 = 그 학년 학기 평균들의 산술평균
  const byLevel = new Map<number, number[]>();
  for (const s of valid) {
    const level = gradeLevelOf(s.key);
    if (level === null) continue;
    byLevel.set(level, [...(byLevel.get(level) ?? []), s.average]);
  }
  if (byLevel.size < 2) return notJudgeable;

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fromLevel = levels[0] as number;
  const toLevel = levels[levels.length - 1] as number;
  const from = mean(byLevel.get(fromLevel) as number[]);
  const to = mean(byLevel.get(toLevel) as number[]);
  const delta = to - from;

  // 부동소수 오차로 경계값이 어긋나지 않도록 소수 여섯째 자리에서 보정 비교
  const d = Math.round(delta * 1e6) / 1e6;
  const verdict: CurveVerdict =
    d <= -threshold ? "rising" : d >= threshold ? "falling" : "flat";

  return {
    verdict,
    delta,
    from,
    to,
    threshold,
    basis: `${fromLevel}학년 ${round2(from)}에서 ${toLevel}학년 ${round2(to)}로 ${round2(Math.abs(delta))}등급 변동`,
  };
}

// No.77: 곡선 보정 폭. rising 은 빼고(유리) falling 은 더한다(불리).
const ADJUST: Record<GradeSystem, number> = { nine: 0.3, five: 0.15 };
const SYSTEM_LABEL: Record<GradeSystem, string> = {
  five: "5등급제",
  nine: "9등급제",
};

export type EstimateAdjustment = {
  estimate: number | null;
  correction: number;
  label: string;
};

export function adjustEstimate(input: {
  actualAverage: number | null;
  verdict: CurveVerdict;
  system: GradeSystem;
}): EstimateAdjustment {
  const width = ADJUST[input.system];
  if (input.actualAverage === null) {
    return { estimate: null, correction: 0, label: "" };
  }
  // 범위(five 1~5, nine 1~9) 클램프는 표시 계층 몫이라 여기선 하지 않는다.
  if (input.verdict === "rising") {
    return {
      estimate: input.actualAverage - width,
      correction: -width,
      label: `상승곡선, ${SYSTEM_LABEL[input.system]} 기준 ${width}`,
    };
  }
  if (input.verdict === "falling") {
    return {
      estimate: input.actualAverage + width,
      correction: width,
      label: `하향곡선, ${SYSTEM_LABEL[input.system]} 기준 ${width}`,
    };
  }
  return { estimate: input.actualAverage, correction: 0, label: "" };
}

export type CurveSummary = {
  actual: number | null;
  estimate: number | null;
  verdict: CurveVerdict;
  correction: number;
  basis: string;
  thresholdText: string;
};

export function curveSummary(input: {
  system: GradeSystem;
  actualAverage: number | null;
  semesterAverages: SemesterAverage[];
}): CurveSummary {
  const judgement = judgeCurve(input);
  const adjusted = adjustEstimate({
    actualAverage: input.actualAverage,
    verdict: judgement.verdict,
    system: input.system,
  });
  return {
    actual: input.actualAverage,
    estimate: adjusted.estimate,
    verdict: judgement.verdict,
    correction: adjusted.correction,
    basis: judgement.basis,
    thresholdText: `${SYSTEM_LABEL[input.system]}는 학년 간 ${judgement.threshold}등급 이상 변동이면 상승 또는 하향, 그 사이는 유지`,
  };
}
