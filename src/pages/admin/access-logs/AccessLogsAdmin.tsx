import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/http/client";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { formatValue } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import { useListSkeleton } from "@/pages/admin/shared/useListSkeleton";
import { type AccessLogFilter, accessLogsQueryOptions } from "./api";

// ---------------------------------------------------------------------------
// 스쿨멘토 본사 개인정보 접근 로그(사 #170, 교 #66, 결정 102.5). 위닝은 제네릭 목록을 그대로 쓰고,
// hqTenantAdmin 이 켜진 사이트만 이 화면을 쓴다(adminSettings.ts 가 스위치). 읽기 전용이다.
// 학생 이름과 교사 전화번호는 서버가 가려서 준다.
// ---------------------------------------------------------------------------

const KINDS: readonly string[] = ["view", "edit", "export", "proxy"];

// 적용된 조건은 새로고침과 뒤로가기에서 살아야 하므로 주소가 원본이다.
function filterFromParams(params: URLSearchParams): AccessLogFilter {
  const kind = params.get("kind") ?? "";
  const page = Number(params.get("page"));
  return {
    tenantCode: params.get("tenantCode") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    kind: KINDS.includes(kind) ? (kind as AccessLogFilter["kind"]) : "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function paramsFromFilter(filter: AccessLogFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.tenantCode) params.set("tenantCode", filter.tenantCode);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.kind) params.set("kind", filter.kind);
  params.set("page", String(filter.page));
  return params;
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromParams(searchParams);
  const setFilter = (next: AccessLogFilter) =>
    setSearchParams(paramsFromFilter(next));
  const [draft, setDraft] = useState<AccessLogFilter>(filter);
  const options = accessLogsQueryOptions(filter);
  const { data, error, isPending, isFetching, dataUpdatedAt } =
    useQuery(options);
  const showSkeleton = useListSkeleton(
    { isPending, isFetching, dataUpdatedAt },
    options.queryKey,
  );
  const errorMessage = error
    ? error instanceof ApiError
      ? error.detail
      : "접근 로그를 불러오지 못했습니다."
    : null;

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
            <option value="create">등록</option>
            <option value="delete">삭제</option>
            <option value="export">출력</option>
            <option value="proxy">대행</option>
          </Select>
        </Field>
        <ActionButton type="submit">조회</ActionButton>
      </form>
      {errorMessage && (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}
      {showSkeleton ? (
        <AdminTableSkeleton
          columns={COLUMNS.length}
          label="접근 로그를 불러오는 중입니다."
        />
      ) : (
        <AdminTableFrame
          label="개인정보 접근 로그"
          className="min-w-[72rem] border-collapse"
        >
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
            {(data?.items ?? []).map((log) => (
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
        </AdminTableFrame>
      )}
      {data?.items.length === 0 && (
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
          disabled={!data?.hasNext}
          onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
        >
          다음
        </ActionButton>
      </div>
    </div>
  );
}
