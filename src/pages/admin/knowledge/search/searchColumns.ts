// 검색 테스트 결과 표의 열 구성. 모드마다 열이 다르다. 헤더, 칸, 빈 결과와 threshold
// 경계선 줄의 colSpan 이 모두 이 배열에서 나온다.

import type { SearchPreviewMode } from "../../../../../api/_lib/knowledge/preview.js";

export type SearchColumnKey =
  | "rank"
  | "title"
  | "grade"
  | "subject"
  | "similarity"
  | "ranks"
  | "rrf"
  | "threshold"
  | "injected";

export type SearchColumn = {
  key: SearchColumnKey;
  label: string;
  /** 헤더 칸 너비. 빈 문자열이면 남은 너비를 쓴다. */
  width: string;
};

const LEADING_COLUMNS: readonly SearchColumn[] = [
  { key: "rank", label: "순위", width: "w-[3rem]" },
  { key: "title", label: "자료명", width: "" },
  { key: "grade", label: "학년", width: "w-[5rem]" },
  { key: "subject", label: "교과군", width: "w-[6rem]" },
  { key: "similarity", label: "유사도", width: "w-[6rem]" },
];

const TRAILING_COLUMNS: readonly SearchColumn[] = [
  { key: "threshold", label: "threshold", width: "w-[6rem]" },
  { key: "injected", label: "실제 주입", width: "w-[6rem]" },
];

const VECTOR_COLUMNS: readonly SearchColumn[] = [
  ...LEADING_COLUMNS,
  ...TRAILING_COLUMNS,
];

// 하이브리드는 뜻 검색과 단어 검색 순위를 합친 점수 순서라 두 순위와 RRF 점수를 더 보여 준다.
const HYBRID_COLUMNS: readonly SearchColumn[] = [
  ...LEADING_COLUMNS,
  { key: "ranks", label: "뜻, 단어 순위", width: "w-[7rem]" },
  { key: "rrf", label: "RRF 점수", width: "w-[6rem]" },
  ...TRAILING_COLUMNS,
];

export function searchColumnsFor(
  mode: SearchPreviewMode,
): readonly SearchColumn[] {
  return mode === "hybrid" ? HYBRID_COLUMNS : VECTOR_COLUMNS;
}
