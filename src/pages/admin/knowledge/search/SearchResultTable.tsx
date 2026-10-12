// 검색 테스트 결과 표. 열 구성은 searchColumns.ts 가 정하고, 이 파일은 칸 내용만 그린다.
// 벡터 결과만 유사도 내림차순이라 threshold 경계선이 한 줄로 그어진다.

import { Fragment } from "react";

import type { SearchPreviewItem } from "../../../../../api/_lib/knowledge/preview.js";
import type { SearchPreviewResult } from "../api";
import { type SearchColumnKey, searchColumnsFor } from "./searchColumns";

function formatRank(rank: number | null | undefined): string {
  return typeof rank === "number" ? String(rank) : "없음";
}

function renderCell(key: SearchColumnKey, item: SearchPreviewItem) {
  switch (key) {
    case "rank":
      return <td className="px-2 py-1">{item.rank}</td>;
    case "title":
      return <td className="px-2 py-1">{item.title}</td>;
    case "grade":
      return <td className="px-2 py-1">{item.grade}</td>;
    case "subject":
      return <td className="px-2 py-1">{item.subject}</td>;
    case "similarity":
      return (
        <td className="px-2 py-1 tabular-nums">{item.similarity.toFixed(4)}</td>
      );
    case "ranks":
      return (
        <td className="px-2 py-1 tabular-nums">
          {formatRank(item.semanticRank)}, {formatRank(item.keywordRank)}
        </td>
      );
    case "rrf":
      return (
        <td className="px-2 py-1 tabular-nums">
          {typeof item.rrfScore === "number" ? item.rrfScore.toFixed(5) : ""}
        </td>
      );
    case "threshold":
      return (
        <td className="px-2 py-1">{item.passesThreshold ? "통과" : "미달"}</td>
      );
    case "injected":
      return (
        <td className="px-2 py-1 font-bold">
          {item.wouldBeInjected ? "주입" : "제외"}
        </td>
      );
  }
}

export default function SearchResultTable({
  result,
}: {
  result: SearchPreviewResult;
}) {
  const isHybridResult = result.mode === "hybrid";
  const columns = searchColumnsFor(result.mode);
  const boundary = isHybridResult
    ? -1
    : result.items.findIndex((item) => !item.passesThreshold);
  // 하이브리드는 단어로만 걸린 카드가 threshold 아래여도 주입되므로 주입 여부로 흐리게 한다.
  const isActive = (item: SearchPreviewItem) =>
    isHybridResult ? item.wouldBeInjected : item.passesThreshold;

  return (
    <table className="w-full text-left">
      <thead className="sticky top-0 bg-gray-50">
        <tr>
          {columns.map((column) => (
            <th key={column.key} className={`${column.width} px-2 py-1`.trim()}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.items.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="px-2 py-6 text-center">
              검색된 카드가 없습니다. 임베딩이 끝난 사용 중 카드만 검색됩니다.
            </td>
          </tr>
        )}
        {result.items.map((item, index) => (
          <Fragment key={item.id}>
            {index === boundary && (
              <tr className="border-t-2 border-red-400">
                <td
                  colSpan={columns.length}
                  className="bg-red-50 px-2 py-1 font-black text-red-600"
                >
                  여기부터 threshold 미달
                </td>
              </tr>
            )}
            <tr
              className={`border-t border-gray-100 ${isActive(item) ? "" : "text-gray-400"}`}
            >
              {columns.map((column) => (
                <Fragment key={column.key}>
                  {renderCell(column.key, item)}
                </Fragment>
              ))}
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
