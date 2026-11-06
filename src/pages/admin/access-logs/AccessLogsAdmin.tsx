import { useEffect, useState } from "react";
import { formatValue } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
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
  const [filter, setFilter] = useState<AccessLogFilter>(EMPTY_FILTER);
  const [draft, setDraft] = useState<AccessLogFilter>(EMPTY_FILTER);
  const [result, setResult] = useState<AccessLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAccessLogs(filter).then((next) => {
      if (cancelled) return;
      if (next.ok) {
        setError(null);
        setResult(next.data);
      } else {
        setError(next.message);
      }
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
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ ...draft, page: 1 });
        }}
      >
        <Field label="소속코드">
          <TextInput
            value={draft.tenantCode}
            onChange={(tenantCode) => setDraft({ ...draft, tenantCode })}
          />
        </Field>
        <Field label="시작일">
          <input
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
            className="h-10 border border-gray-300 px-3 text-sm font-bold"
          />
        </Field>
        <Field label="종료일">
          <input
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            className="h-10 border border-gray-300 px-3 text-sm font-bold"
          />
        </Field>
        <Field label="구분">
          <Select
            value={draft.kind}
            onChange={(kind) =>
              setDraft({ ...draft, kind: kind as AccessLogFilter["kind"] })
            }
          >
            <option value="">전체</option>
            <option value="view">조회</option>
            <option value="edit">수정</option>
            <option value="export">출력</option>
            <option value="proxy">대행</option>
          </Select>
        </Field>
        <ActionButton type="submit">조회</ActionButton>
      </form>
      {error && (
        <p role="alert" className="mb-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}
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
      {result?.logs.length === 0 && (
        <p className="py-12 text-center text-sm text-gray-400">
          기록이 없어요.
        </p>
      )}
      <div className="mt-4 flex items-center justify-center gap-3">
        <ActionButton
          variant="light"
          disabled={filter.page <= 1}
          onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
        >
          이전
        </ActionButton>
        <span className="text-sm font-bold">{filter.page}쪽</span>
        <ActionButton
          variant="light"
          disabled={!result?.hasNext}
          onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
        >
          다음
        </ActionButton>
      </div>
    </div>
  );
}
