import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        <span className="text-sm font-bold text-gray-500">
          전체 <span className="text-blue-600">{items.length}</span>건
        </span>
        <ActionButton
          variant="light"
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
        >
          {order === "asc" ? "인용 적은 순" : "인용 많은 순"}
        </ActionButton>
      </div>
      <ScrollArea axis="x">
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <Th>자료명</Th>
              <Th>유형</Th>
              <Th>활성</Th>
              <Th>적중 횟수</Th>
              <Th>인용 횟수</Th>
              <Th>마지막 적중</Th>
              <Th>마지막 인용</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  조회된 자료가 없습니다.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.resourceId}
                  className={`border-b border-gray-100 ${row.isActive ? "" : "text-gray-400"}`}
                >
                  <td className="px-3 py-3 font-bold">{row.title}</td>
                  <td className="px-3 py-3">{row.knowledgeType}</td>
                  <td className="px-3 py-3">
                    {row.isActive ? "활성" : "비활성"}
                  </td>
                  <td className="px-3 py-3">{formatInt(row.hitCount)}</td>
                  <td className="px-3 py-3">{formatInt(row.citedCount)}</td>
                  <td className="px-3 py-3">{formatDate(row.lastHitAt)}</td>
                  <td className="px-3 py-3">{formatDate(row.lastCitedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
