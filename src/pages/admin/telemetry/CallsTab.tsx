import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
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
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={15}
                className="py-12 text-center text-muted-foreground"
              >
                조회된 호출이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => setSelected(row)}
                className="cursor-pointer"
              >
                <TableCell>
                  <button
                    type="button"
                    className="rounded-sm underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                    onClick={() => setSelected(row)}
                  >
                    {formatDate(row.createdAt)}
                  </button>
                </TableCell>
                <TableCell>{serviceLabel(row.service)}</TableCell>
                <TableCell>{row.feature}</TableCell>
                <TableCell>{row.step ?? ""}</TableCell>
                <TableCell>{row.callKey ?? ""}</TableCell>
                <TableCell>{row.model}</TableCell>
                <TableCell>{row.attempt}</TableCell>
                <TableCell>{row.transportAttempt ?? ""}</TableCell>
                <TableCell
                  className={
                    row.status === "error" ? "font-medium text-red-600" : ""
                  }
                >
                  {row.status}
                </TableCell>
                <TableCell>{row.finishReason ?? ""}</TableCell>
                <TableCell>{formatNullableInt(row.tokens.prompt)}</TableCell>
                <TableCell>{formatNullableInt(row.tokens.output)}</TableCell>
                <TableCell>{formatNullableInt(row.tokens.cached)}</TableCell>
                <TableCell>{formatMs(row.latencyMs)}</TableCell>
                <TableCell>{row.validation ?? ""}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <AdminPagination
        page={page}
        totalPages={lastPage}
        onPageChange={onPage}
      />

      <CallDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
