// 모델 판정 위에 서버가 결정론으로 덮어쓰는 검증 보정(§2 20, 명세 No.53, No.23).
// 문자열 포함 여부처럼 코드가 더 정확히 가릴 수 있는 것은 모델에 맡기지 않는다.

import { extractKeywords } from "./text.js";
import type {
  ActivityRecordLike,
  GrowthFit,
  GrowthSnapshot,
  ScoreCheck,
  ScoreItemKey,
} from "./types.js";

const uniq = (xs: string[]): string[] => [...new Set(xs)];

/**
 * 판정 기준이 되는 개념과 자료 낱말을 선택 기록 전부의 7항목에서 모은다(명세 No.55).
 * 핵심 분석에서만 뽑으면 다른 기록의 개념과 자료를 쓴 글이 억울하게 낮게 나온다.
 */
export function recordTerms(records: ActivityRecordLike[]): {
  concepts: string[];
  sources: string[];
} {
  return {
    concepts: uniq(records.flatMap((r) => extractKeywords(r.concept ?? ""))),
    sources: uniq(
      records.flatMap((r) =>
        Array.isArray(r.sources)
          ? r.sources
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim())
              .filter((x) => x !== "")
          : [],
      ),
    ),
  };
}

/** 문항 대응(prompt) 항목에서 "핵심 낱말이 본문에 반영되는가" 가 두 번째 확인 문장이다. */
const PROMPT_KEYWORD_CHECK_INDEX = 1;

/**
 * 학교 문항의 핵심 낱말이 하나라도 본문에 있으면 통과로 덮어쓴다. 낱말이 비어 있으면
 * 문항에서 낱말을 못 뽑은 것이므로 모델 판정을 그대로 둔다. 입력은 바꾸지 않는다.
 */
export function applyDeterministicChecks(
  checks: Record<ScoreItemKey, ScoreCheck[]>,
  ctx: { text: string; promptKeywords: string[] },
): Record<ScoreItemKey, ScoreCheck[]> {
  if (ctx.promptKeywords.length === 0) return checks;
  const hit = ctx.promptKeywords.some((k) => ctx.text.includes(k));
  return {
    ...checks,
    prompt: checks.prompt.map((c, i) =>
      i === PROMPT_KEYWORD_CHECK_INDEX ? { ...c, pass: hit } : c,
    ),
  };
}

/**
 * 성장설계가 지목한 부족 축을 본문이 채웠는지. 축 가이드라인의 낱말 중 하나가
 * 본문에 있으면 채운 것으로 본다. 근사 판정이라 "채웠다" 의 증명이 아니라 신호다.
 */
export function growthSignalChecks(
  text: string,
  snapshot: Pick<GrowthSnapshot, "alignedSignals" | "weakAxes">,
): GrowthFit["axisChecks"] {
  return snapshot.weakAxes.map((w) => ({
    axis: w.axis,
    name: w.name,
    satisfied: extractKeywords(w.guideline).some((k) => text.includes(k)),
    current: w.count,
    required: w.required,
    guideline: w.guideline,
  }));
}
