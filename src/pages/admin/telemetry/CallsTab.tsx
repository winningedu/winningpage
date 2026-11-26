import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
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
      <div className="mb-4 text-sm text-muted-foreground">
        전체 <span className="text-primary">{data.total}</span>건
      </div>
      <AdminTableFrame label="호출 기록" className="min-w-[80rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Th>시각</Th>
            <Th>서비스</Th>
            <Th>기능</Th>
            <Th>단계</Th>
            <Th>호출</Th>
            <Th>모델</Th>
            <Th className="text-right">시도</Th>
            <Th className="text-right">전송 시도</Th>
            <Th>상태</Th>
            <Th>finish</Th>
            <Th className="text-right">prompt</Th>
            <Th className="text-right">output</Th>
            <Th className="text-right">cached</Th>
            <Th className="text-right">지연 ms</Th>
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
                <TableCell className="px-3 py-3">
                  <button
                    type="button"
                    className="rounded-sm underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelected(row);
                    }}
                  >
                    {formatDate(row.createdAt)}
                  </button>
                </TableCell>
                <TableCell className="px-3 py-3">
                  {serviceLabel(row.service)}
                </TableCell>
                <TableCell className="px-3 py-3">{row.feature}</TableCell>
                <TableCell className="px-3 py-3">{row.step ?? ""}</TableCell>
                <TableCell className="px-3 py-3">{row.callKey ?? ""}</TableCell>
                <TableCell className="px-3 py-3">{row.model}</TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {row.attempt}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {row.transportAttempt ?? ""}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-3",
                    row.status === "error" && "font-medium text-destructive",
                  )}
                >
                  {row.status}
                </TableCell>
                <TableCell className="px-3 py-3">
                  {row.finishReason ?? ""}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {formatNullableInt(row.tokens.prompt)}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {formatNullableInt(row.tokens.output)}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {formatNullableInt(row.tokens.cached)}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {formatMs(row.latencyMs)}
                </TableCell>
                <TableCell className="px-3 py-3">
                  {row.validation ?? ""}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </AdminTableFrame>

      <AdminPagination
        page={page}
        totalPages={lastPage}
        onPageChange={onPage}
      />

      <CallDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
