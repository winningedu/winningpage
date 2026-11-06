import { Download } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { downloadCsv, formatValue } from "@/pages/admin/shared/csvExport";
import { ActionButton } from "@/pages/admin/shared/formFields";
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
        <ActionButton
          variant="light"
          disabled={logs.length === 0}
          onClick={() =>
            downloadCsv(
              "member-purge-logs.csv",
              logs.map(toCsvRow),
              CSV_COLUMNS,
            )
          }
        >
          <Download size={14} />
          파일 내려받기
        </ActionButton>
      </div>
      {error && (
        <div className="mb-4 text-sm font-bold text-red-600">{error}</div>
      )}
      <div className="bg-white p-6 shadow-sm">
        <table className="w-full min-w-[55rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              {CSV_COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-3 text-left">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  삭제 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <Fragment key={log.id}>
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-3">
                      {formatValue(log.executedAt, "datetime")}
                    </td>
                    <td className="px-3 py-3">{log.executedBy ?? "-"}</td>
                    <td className="px-3 py-3 font-bold">
                      {log.tenant?.name ?? "-"}
                    </td>
                    <td className="px-3 py-3">{log.contractEndDate ?? "-"}</td>
                    <td className="px-3 py-3">{log.deletedCount}</td>
                    <td className="px-3 py-3">{log.excludedCount}</td>
                    <td className="px-3 py-3">{log.skippedCount}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        aria-expanded={opened.has(log.id)}
                        onClick={() => toggle(log.id)}
                        className="text-xs font-black text-[#2348ff] underline"
                      >
                        회원번호 보기
                      </button>
                    </td>
                  </tr>
                  {opened.has(log.id) && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={8} className="px-3 py-3">
                        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                          {log.memberIds.map((id) => (
                            <li key={id}>{id}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
