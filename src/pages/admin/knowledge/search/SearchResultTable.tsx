// 검색 테스트 결과 표. 열 구성은 searchColumns.ts 가 정하고, 이 파일은 칸 내용만 그린다.
// 벡터 결과만 유사도 내림차순이라 threshold 경계선이 한 줄로 그어진다.

import { Fragment } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { SearchPreviewItem } from "../../../../../api/_lib/knowledge/preview.js";
import type { SearchPreviewResult } from "../api";
import { type SearchColumnKey, searchColumnsFor } from "./searchColumns";

function formatRank(rank: number | null | undefined): string {
  return typeof rank === "number" ? String(rank) : "없음";
}

function renderCell(key: SearchColumnKey, item: SearchPreviewItem) {
  switch (key) {
    case "rank":
      return <TableCell className="px-2 py-1">{item.rank}</TableCell>;
    case "title":
      return (
        <TableCell className="px-2 py-1 whitespace-normal">
          {item.title}
        </TableCell>
      );
    case "grade":
      return <TableCell className="px-2 py-1">{item.grade}</TableCell>;
    case "subject":
      return <TableCell className="px-2 py-1">{item.subject}</TableCell>;
    case "similarity":
      return (
        <TableCell className="px-2 py-1 tabular-nums">
          {item.similarity.toFixed(4)}
        </TableCell>
      );
    case "ranks":
      return (
        <TableCell className="px-2 py-1 tabular-nums">
          {formatRank(item.semanticRank)}, {formatRank(item.keywordRank)}
        </TableCell>
      );
    case "rrf":
      return (
        <TableCell className="px-2 py-1 tabular-nums">
          {typeof item.rrfScore === "number" ? item.rrfScore.toFixed(5) : ""}
        </TableCell>
      );
    case "threshold":
      return (
        <TableCell className="px-2 py-1">
          {item.passesThreshold ? "통과" : "미달"}
        </TableCell>
      );
    case "injected":
      return (
        <TableCell className="px-2 py-1 font-medium">
          {item.wouldBeInjected ? "주입" : "제외"}
        </TableCell>
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
      <TableHeader className="sticky top-0 z-10 bg-muted">
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.key}
              scope="col"
              className={`${column.width} h-8 px-2 font-semibold whitespace-normal`.trim()}
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.items.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={columns.length}
              className="px-2 py-6 text-center whitespace-normal text-muted-foreground"
            >
              검색된 카드가 없습니다. 임베딩이 끝난 사용 중 카드만 검색됩니다.
            </TableCell>
          </TableRow>
        )}
        {result.items.map((item, index) => (
          <Fragment key={item.id}>
            {index === boundary && (
              <TableRow className="border-t-2 border-red-400 hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="bg-red-50 px-2 py-1 font-semibold text-destructive"
                >
                  여기부터 threshold 미달
                </TableCell>
              </TableRow>
            )}
            <TableRow className={isActive(item) ? "" : "text-muted-foreground"}>
              {columns.map((column) => (
                <Fragment key={column.key}>
                  {renderCell(column.key, item)}
                </Fragment>
              ))}
            </TableRow>
          </Fragment>
        ))}
      </TableBody>
    </table>
  );
}
