import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionButton } from "@/pages/admin/shared/formFields";
import type { CitationItem } from "./api";
import { formatDate, formatInt } from "./format";
import { Th } from "./TableCells";

export default function CitationsTab({ items }: { items: CitationItem[] }) {
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        order === "asc"
          ? a.citedCount - b.citedCount
          : b.citedCount - a.citedCount,
      ),
    [items, order],
  );

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          전체 <span className="text-primary">{items.length}</span>건
        </span>
        <ActionButton
          variant="light"
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
        >
          {order === "asc" ? "인용 적은 순" : "인용 많은 순"}
        </ActionButton>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Th>자료명</Th>
            <Th>유형</Th>
            <Th>활성</Th>
            <Th>적중 횟수</Th>
            <Th>인용 횟수</Th>
            <Th>마지막 적중</Th>
            <Th>마지막 인용</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={7}
                className="py-12 text-center text-muted-foreground"
              >
                조회된 자료가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow
                key={row.resourceId}
                className={row.isActive ? "" : "text-muted-foreground"}
              >
                <TableCell className="font-medium whitespace-normal">
                  {row.title}
                </TableCell>
                <TableCell>{row.knowledgeType}</TableCell>
                <TableCell>{row.isActive ? "활성" : "비활성"}</TableCell>
                <TableCell>{formatInt(row.hitCount)}</TableCell>
                <TableCell>{formatInt(row.citedCount)}</TableCell>
                <TableCell>{formatDate(row.lastHitAt)}</TableCell>
                <TableCell>{formatDate(row.lastCitedAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
