// 채점, 필수 수정, 고치면 좋은 곳(명세 No.53, 54, 57, 58, 59). 모델은 확인 문장의
// 통과 여부만 주고 점수는 서버가 계산한다. 같은 확인 결과면 항상 같은 점수가 나온다.

import {
  EXCLUDED_ITEMS,
  IMPROVEMENT_HINTS,
  SCORE_RUBRIC,
} from "./dictionaries.js";
import { runFormatChecks } from "./format.js";
import {
  clicheDensity,
  countChars,
  countSentences,
  extractNumbers,
} from "./text.js";
import type {
  FormatCheck,
  GrowthFit,
  Improvement,
  MandatoryFix,
  ScoreCheck,
  ScoreItem,
  ScoreItemKey,
  Sentence,
  TargetCharsMode,
  VerificationSections,
} from "./types.js";

/** 판단 점수가 이 값 미만이면 제출 전에 반드시 고친다(명세 No.57). */
const JUDGMENT_MIN_SCORE = 15;
const MAX_IMPROVEMENTS = 3;

export function scoreItems(
  checks: Record<ScoreItemKey, ScoreCheck[]>,
): ScoreItem[] {
  return SCORE_RUBRIC.map((row) => {
    const list = checks[row.key] ?? [];
    const passed = list.filter((c) => c.pass).length;
    return {
      key: row.key,
      label: row.label,
      max: row.max,
      discrimination: row.discrimination,
      checks: list,
      score:
        list.length === 0 ? 0 : Math.round((row.max * passed) / list.length),
    };
  });
}

export function totalScore(items: ScoreItem[]): number {
  return items.reduce((sum, i) => sum + i.score, 0);
}

export function mandatoryFixes(input: {
  items: ScoreItem[];
  format: FormatCheck[];
  clicheHits: string[];
}): MandatoryFix[] {
  const failed = (key: FormatCheck["key"]) =>
    input.format.some((f) => f.key === key && !f.pass);
  const fixes: MandatoryFix[] = [];

  if (failed("no_pending_feelings")) {
    fixes.push({
      key: "pending_feelings",
      message:
        "확인이 필요한 문장이 남아 있어요. 노란 표시 문장을 확인하거나 고쳐 주세요",
      detail: null,
    });
  }
  if (failed("cliche_density")) {
    // 어떤 표현을 고쳐야 하는지 알려 주려고 중복을 뺀 목록을 붙인다(명세 No.123).
    const unique = [...new Set(input.clicheHits)];
    fixes.push({
      key: "cliche",
      message: "상투어가 기준보다 많아요. 구체적인 사실로 바꿔 주세요",
      detail: unique.length > 0 ? unique.join(", ") : null,
    });
  }
  const judgment = input.items.find((i) => i.key === "judgment");
  if (judgment && judgment.score < JUDGMENT_MIN_SCORE) {
    fixes.push({
      key: "judgment_low",
      message:
        "결과로 무엇을 판단했는지가 약해요. 판단 문장과 근거 자료를 넣어 주세요",
      detail: `판단 ${judgment.score}점, ${JUDGMENT_MIN_SCORE}점 이상이어야 해요`,
    });
  }
  return fixes;
}

export function isSubmittable(fixes: MandatoryFix[]): boolean {
  return fixes.length === 0;
}

/** 만점이 아닌 항목을 점수 비율이 낮은 순, 동률은 배점이 큰 순으로 최대 3개. */
export function improvements(items: ScoreItem[]): Improvement[] {
  return items
    .filter((i) => i.max > 0 && i.score < i.max)
    .sort((a, b) => a.score / a.max - b.score / b.max || b.max - a.max)
    .slice(0, MAX_IMPROVEMENTS)
    .map((i) => ({
      key: i.key,
      label: i.label,
      message: IMPROVEMENT_HINTS[i.key],
      failedChecks: i.checks.filter((c) => !c.pass).map((c) => c.text),
    }));
}

export function assembleVerification(input: {
  checks: Record<ScoreItemKey, ScoreCheck[]>;
  text: string;
  targetChars: number | null;
  mode: TargetCharsMode;
  universities: string[];
  sentences: Sentence[];
  growthFit: GrowthFit | null;
}): VerificationSections {
  const items = scoreItems(input.checks);
  const format = runFormatChecks({
    text: input.text,
    targetChars: input.targetChars,
    mode: input.mode,
    universities: input.universities,
    sentences: input.sentences,
  });
  const cliche = clicheDensity(input.text, input.mode);
  const fixes = mandatoryFixes({ items, format, clicheHits: cliche.hits });
  return {
    items,
    total: totalScore(items),
    format,
    mandatoryFixes: fixes,
    submittable: isSubmittable(fixes),
    improvements: improvements(items),
    excluded: EXCLUDED_ITEMS.map((e) => ({ ...e })),
    growthFit: input.growthFit,
    charCount: countChars(input.text),
    sentenceCount: countSentences(input.text),
    clicheDensity: cliche.density,
    clicheHits: cliche.hits,
    numberCount: extractNumbers(input.text).length,
  };
}
