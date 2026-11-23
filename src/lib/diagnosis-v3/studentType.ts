// Student type, 06_임계값 r25-r33 (spec No 48-57): the first matching rule in
// rank order wins; 응답 단순 skips the verdict. The rules are code
// (judge-report R7 (a)); studentType.test.ts pins the 06 C condition text so a
// sheet change fails the tests.

import type { AreaScores } from "./scoring.js";
import { sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Scores, StudentType } from "./types.js";

type Rule = (scores: AreaScores) => boolean;

// 06 C25-C33 in rank order.
const RULES: readonly Rule[] = [
  // ALL_P1 >= 70 AND [종합] >= 70
  ({ page1 }) =>
    Object.values(page1.areas).every((a) => a.score >= 70) && page1.total >= 70,
  // [불안 회복] < 50 AND [학습 수행] < 60
  ({ page1, mind }) =>
    mind.areas.MIND_RECV.score < 50 && page1.areas.P1_EXEC.score < 60,
  // [목표 설정] < 50
  ({ page1 }) => page1.areas.P1_GOAL.score < 50,
  // [계획 수립] >= 60 AND [학습 수행] < 50
  ({ page1 }) =>
    page1.areas.P1_PLAN.score >= 60 && page1.areas.P1_EXEC.score < 50,
  // [목표 설정] >= 70 AND [학습 수행] < 60
  ({ page1 }) =>
    page1.areas.P1_GOAL.score >= 70 && page1.areas.P1_EXEC.score < 60,
  // [우선순위] < 50 AND [학습 수행] >= 50
  ({ page1 }) =>
    page1.areas.P1_PRIO.score < 50 && page1.areas.P1_EXEC.score >= 50,
  // [활동 기록] < 50 AND MIN([패턴 분석],[피드백 조정]) < 70
  ({ page1 }) =>
    page1.areas.P1_LOG.score < 50 &&
    Math.min(page1.areas.P1_PATT.score, page1.areas.P1_ADJ.score) < 70,
  // [학습 수행] >= 60 AND [패턴 분석] < 55
  ({ page1 }) =>
    page1.areas.P1_EXEC.score >= 60 && page1.areas.P1_PATT.score < 55,
  // ELSE
  () => true,
];

/** 06 D25-D33: TYPE_n copy id per rank, so rank 7 is TYPE_9. */
const TYPE_BY_RANK: readonly StudentType[] = sheetRows("06_임계값")
  .filter((row) => row.c[0] === "유형")
  .map((row) => {
    const id = textCell(row, 3).match(/^TYPE_(\d)$/)?.[1];
    if (!id) throw new Error(`bad 06 D${row.r}`);
    return Number(id) as StudentType;
  });

if (TYPE_BY_RANK.length !== RULES.length) {
  throw new Error("06 유형 rows and the coded rules differ in count");
}

export function studentType(
  scores: AreaScores,
  reliability: DiagnosisV3Scores["reliability"],
): StudentType | null {
  if (reliability.diagnosis === "SIMPLE") return null;
  const rank = RULES.findIndex((rule) => rule(scores));
  return TYPE_BY_RANK[rank] ?? null;
}
