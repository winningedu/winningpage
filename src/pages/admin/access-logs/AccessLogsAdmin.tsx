import { useEffect, useState } from "react";
import { formatValue } from "@/pages/admin/shared/csvExport";
import {
  type AccessLogFilter,
  type AccessLogPage,
  fetchAccessLogs,
} from "./api";

// ---------------------------------------------------------------------------
// 스쿨멘토 본사 개인정보 접근 로그(사 #170, 교 #66, 결정 102.5). 위닝은 제네릭 목록을 그대로 쓰고,
// hqTenantAdmin 이 켜진 사이트만 이 화면을 쓴다(adminSettings.ts 가 스위치). 읽기 전용이다.
// 학생 이름과 교사 전화번호는 서버가 가려서 준다.
// ---------------------------------------------------------------------------

const EMPTY_FILTER: AccessLogFilter = {
  tenantCode: "",
  from: "",
  to: "",
  kind: "",
  page: 1,
};

const COLUMNS = [
  "일시",
  "소속코드",
  "교사 이름",
  "교사 코드",
  "교사 전화번호",
  "구분",
  "대상 학생",
  "내용",
  "대행 여부",
];

export default function AccessLogsAdmin() {
  const [filter] = useState<AccessLogFilter>(EMPTY_FILTER);
  const [result, setResult] = useState<AccessLogPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAccessLogs(filter).then((next) => {
      if (!cancelled && next.ok) setResult(next.data);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-black text-[#111827]">
        개인정보 접근 로그
      </h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              {COLUMNS.map((name) => (
                <th key={name} className="px-3 py-3 text-left">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(result?.logs ?? []).map((log) => (
              <tr key={log.id} className="border-b border-gray-100">
                <td className="px-3 py-3">
                  {formatValue(log.createdAt, "datetime")}
                </td>
                <td className="px-3 py-3">{log.tenantCode ?? "-"}</td>
                <td className="px-3 py-3">{log.teacherName ?? "-"}</td>
                <td className="px-3 py-3">{log.teacherLoginId ?? "-"}</td>
                <td className="px-3 py-3">{log.teacherPhone ?? "-"}</td>
                <td className="px-3 py-3">{log.kindLabel}</td>
                <td className="px-3 py-3">{log.targetStudentName ?? "-"}</td>
                <td className="px-3 py-3">{log.content}</td>
                <td className="px-3 py-3">{log.isProxy ? "대행" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
