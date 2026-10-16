// 지식 검색 품질 평가 화면의 지표 표시 변환. 실행, 조합 비교, 이력 탭이 같이 쓴다.
import type { EvalParams } from "./form";

export const RECALL_KS = ["1", "3", "5", "10"];

export function formatMetric(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "";
}

export function formatParams(params: EvalParams): string {
  return `k ${params.rrfK} / 단어 ${params.fullTextWeight} / 의미 ${params.semanticWeight} / threshold ${params.matchThreshold} / match_count ${params.matchCount}`;
}
