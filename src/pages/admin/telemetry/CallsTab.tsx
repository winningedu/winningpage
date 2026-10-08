import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionButton } from "@/pages/admin/shared/formFields";
import type { CallItem, CallsPage } from "./api";
import CallDetailDialog from "./CallDetailDialog";
import {
  formatDate,
  formatMs,
  formatNullableInt,
  serviceLabel,
} from "./format";
import { Th } from "./TableCells";

export default function CallsTab({
  data,
  page,
  pageSize,
  onPage,
}: {
  data: CallsPage;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const [selected, setSelected] = useState<CallItem | null>(null);
  const lastPage = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-4 text-sm font-bold text-gray-500">
        전체 <span className="text-blue-600">{data.total}</span>건
      </div>
      <ScrollArea axis="x">
        <table className="w-full min-w-[80rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <Th>시각</Th>
              <Th>서비스</Th>
              <Th>기능</Th>
              <Th>단계</Th>
              <Th>호출</Th>
              <Th>모델</Th>
              <Th>시도</Th>
              <Th>전송 시도</Th>
              <Th>상태</Th>
              <Th>finish</Th>
              <Th>prompt</Th>
              <Th>output</Th>
              <Th>cached</Th>
              <Th>지연 ms</Th>
              <Th>검증</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-gray-400">
                  조회된 호출이 없습니다.
                </td>
              </tr>
            ) : (
              data.items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-3">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-3">{serviceLabel(row.service)}</td>
                  <td className="px-3 py-3">{row.feature}</td>
                  <td className="px-3 py-3">{row.step ?? ""}</td>
                  <td className="px-3 py-3">{row.callKey ?? ""}</td>
                  <td className="px-3 py-3">{row.model}</td>
                  <td className="px-3 py-3">{row.attempt}</td>
                  <td className="px-3 py-3">{row.transportAttempt ?? ""}</td>
                  <td
                    className={`px-3 py-3 font-bold ${row.status === "error" ? "text-red-600" : ""}`}
                  >
                    {row.status}
                  </td>
                  <td className="px-3 py-3">{row.finishReason ?? ""}</td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.prompt)}
                  </td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.output)}
                  </td>
                  <td className="px-3 py-3">
                    {formatNullableInt(row.tokens.cached)}
                  </td>
                  <td className="px-3 py-3">{formatMs(row.latencyMs)}</td>
                  <td className="px-3 py-3">{row.validation ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
        <ActionButton
          variant="light"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          이전
        </ActionButton>
        <span>
          {page} / {lastPage}
        </span>
        <ActionButton
          variant="light"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          다음
        </ActionButton>
      </div>

      <CallDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
