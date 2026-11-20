import { Download } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, formatValue } from "@/pages/admin/shared/csvExport";
import { fetchPurgeLogs, type PurgeLogEntry } from "./api";

// ---------------------------------------------------------------------------
// 삭제 로그(사 #163, #177). 서버가 이름과 연락처 없이 내려 주는 목록을 그대로 보인다. 회원번호는 길어서 펼쳐서 본다.
// 파일은 같은 열로 만든다(회원번호는 공백으로 이어 한 칸).
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  { key: "executedAt", label: "실행 일시", type: "datetime" },
  { key: "executedBy", label: "실행자" },
  { key: "tenantName", label: "기관" },
  { key: "contractEndDate", label: "계약 종료일" },
  { key: "deletedCount", label: "삭제 건수" },
  { key: "excludedCount", label: "제외(유료 전환) 건수" },
  { key: "skippedCount", label: "제외(직접) 건수" },
  { key: "memberIds", label: "회원번호" },
];

function toCsvRow(log: PurgeLogEntry) {
  return {
    executedAt: log.executedAt,
    executedBy: log.executedBy,
    tenantName: log.tenant?.name ?? "",
    contractEndDate: log.contractEndDate,
    deletedCount: log.deletedCount,
    excludedCount: log.excludedCount,
    skippedCount: log.skippedCount,
    memberIds: log.memberIds.join(" "),
  };
}

export default function PurgeLogsAdmin() {
  const [logs, setLogs] = useState<PurgeLogEntry[]>([]);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetchPurgeLogs().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLogs(result.data.logs);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: string) {
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black">삭제 로그</h1>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={logs.length === 0}
          onClick={() =>
            downloadCsv(
              "member-purge-logs.csv",
              logs.map(toCsvRow),
              CSV_COLUMNS,
            )
          }
        >
          <Download size={14} aria-hidden="true" />
          파일 내려받기
        </Button>
      </div>
      {error && (
        <div role="alert" className="mb-4 text-sm font-bold text-red-600">
          {error}
        </div>
      )}
      <div className="bg-white p-6 shadow-sm">
        <Table className="min-w-[55rem] border-collapse">
          <TableHeader>
            <TableRow className="border-y border-gray-300 hover:bg-transparent">
              {CSV_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  className="whitespace-normal px-3 py-3 text-left font-semibold"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  삭제 로그가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <Fragment key={log.id}>
                  <TableRow className="border-b border-gray-100">
                    <TableCell className="px-3 py-3">
                      {formatValue(log.executedAt, "datetime")}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {log.executedBy ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3 font-medium">
                      {log.tenant?.name ?? "-"}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {log.contractEndDate ?? "-"}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {log.deletedCount}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {log.excludedCount}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {log.skippedCount}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <button
                        type="button"
                        aria-expanded={opened.has(log.id)}
                        onClick={() => toggle(log.id)}
                        className="text-xs font-semibold text-primary underline"
                      >
                        회원번호 보기
                      </button>
                    </TableCell>
                  </TableRow>
                  {opened.has(log.id) && (
                    <TableRow className="border-b border-gray-100 bg-muted/50">
                      <TableCell
                        colSpan={8}
                        className="whitespace-normal px-3 py-3"
                      >
                        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                          {log.memberIds.map((id) => (
                            <li key={id}>{id}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
