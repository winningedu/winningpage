import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  "관리자",
  "선생님 이름",
  "선생님 코드",
  "선생님 전화번호",
  "구분",
  "대상 학생",
  "내용",
  "사유",
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
        setResult(null);
        setError(next.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold text-foreground">
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
          <Input
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
            className="h-10 font-medium"
          />
        </Field>
        <Field label="종료일">
          <Input
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            className="h-10 font-medium"
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
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <Table className="min-w-[72rem] border-collapse">
        <TableHeader>
          <TableRow className="border-y border-gray-300 hover:bg-transparent">
            {COLUMNS.map((name) => (
              <TableHead
                key={name}
                scope="col"
                className="whitespace-normal px-3 py-3 text-left font-semibold"
              >
                {name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(result?.logs ?? []).map((log) => (
            <TableRow key={log.id} className="border-b border-gray-100">
              <TableCell className="px-3 py-3">
                {formatValue(log.createdAt, "datetime")}
              </TableCell>
              <TableCell className="px-3 py-3">
                {log.tenantCode ?? "-"}
              </TableCell>
              <TableCell className="whitespace-normal px-3 py-3">
                {(log.actorName ?? log.actorEmail) ? (
                  <>
                    {log.actorName && <div>{log.actorName}</div>}
                    {log.actorEmail && (
                      <div className="text-xs text-muted-foreground">
                        {log.actorEmail}
                      </div>
                    )}
                  </>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="whitespace-normal px-3 py-3">
                {log.teacherName ?? "-"}
              </TableCell>
              <TableCell className="px-3 py-3">
                {log.teacherLoginId ?? "-"}
              </TableCell>
              <TableCell className="px-3 py-3">
                {log.teacherPhone ?? "-"}
              </TableCell>
              <TableCell className="px-3 py-3">{log.kindLabel}</TableCell>
              <TableCell className="whitespace-normal px-3 py-3">
                {log.targetStudentName ?? "-"}
              </TableCell>
              <TableCell className="whitespace-normal px-3 py-3">
                {log.content}
              </TableCell>
              <TableCell className="whitespace-normal px-3 py-3">
                {log.reason ?? "-"}
              </TableCell>
              <TableCell className="px-3 py-3">
                {log.isProxy ? "대행" : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {result?.logs.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
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
        <span className="text-sm font-medium">{filter.page}쪽</span>
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
