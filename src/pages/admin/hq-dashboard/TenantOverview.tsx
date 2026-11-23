// 본사 대시보드 기관 현황(계획 4번 A1, A2, A3, A4, A6, A8, A9). 합계 카드와 기관 표.
// 검색, 필터, 정렬, 쪽, "QA, 관리자 계정 포함" 스위치는 모두 URL 검색 파라미터에 둔다.
// 기관을 고르면 onSelectTenant 로 넘긴다(읽기 전용 대행 시작은 부르는 쪽이 정한다).
// 시범기간(결정 117)은 카드, 상태 필터, 표의 시범기간 열에 있다. 사용량과 한도 열은 나중에 더한다.

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { useSensitiveActionGate } from "@/pages/admin/shared/SensitiveActionGate";
import { triggerXlsxDownload } from "@/pages/admin/shared/xlsxDownload";
import { type ContractStatus, fetchHqSummary, fetchHqTenants } from "./api";
import {
  applyTenantTable,
  CONTRACT_LABELS,
  contractPeriod,
  PARAM,
  readTenantTableParams,
  type SortKey,
  tenantExportRow,
  trialPeriod,
} from "./tenantTable";

const INCLUDE_PARAM = "includeInternal";
const RESOURCE_KEY = "hqDashboard";
const HEAD = "whitespace-normal px-4 py-3 font-semibold";

const COLUMNS: { label: string; sort?: SortKey; className?: string }[] = [
  { label: "기관명", sort: "name" },
  { label: "기관 유형" },
  { label: "계약 상태" },
  { label: "계약 기간", sort: "contractEndDate" },
  { label: "시범기간" },
  { label: "학생 수", sort: "studentCount", className: "text-right" },
  { label: "선생님 수", sort: "teacherCount", className: "text-right" },
  { label: "마지막 활동일", sort: "lastActivityOn" },
  {
    label: "목표 실행률 평균",
    sort: "goalRateAverage",
    className: "text-right",
  },
];

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string | undefined;
}) {
  return (
    <Card size="sm" className="bg-muted px-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </Card>
  );
}

export default function TenantOverview({
  onSelectTenant,
}: {
  onSelectTenant: (tenantId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const includeInternal = searchParams.get(INCLUDE_PARAM) === "1";
  const params = readTenantTableParams(searchParams);
  const { requestAccess, gate } = useSensitiveActionGate();

  const summary = useQuery({
    queryKey: ["hqDashboard", "summary", includeInternal],
    queryFn: () => fetchHqSummary(includeInternal),
  });
  const tenants = useQuery({
    queryKey: ["hqDashboard", "tenants", includeInternal],
    queryFn: () => fetchHqTenants(includeInternal),
  });

  const rows = tenants.data?.tenants ?? [];
  const orgTypes = useMemo(
    () =>
      [...new Set(rows.map((r) => r.orgType))].sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [rows],
  );
  const table = applyTenantTable(rows, params);

  /** 값이 비면 키를 지운다. 필터가 바뀌면 쪽은 1로 돌아간다. */
  function update(changes: Record<string, string | null>, keepPage = false) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete(PARAM.page);
        return next;
      },
      { replace: true },
    );
  }

  function toggleSort(key: SortKey) {
    const desc = params.sort === key && params.dir === "asc";
    update({ [PARAM.sort]: key, [PARAM.dir]: desc ? "desc" : null });
  }

  function requestExport() {
    if (table.filtered.length === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }
    const exported = table.filtered;
    const asOf = tenants.data?.asOf ?? "";
    requestAccess({
      action: "download",
      resourceKey: RESOURCE_KEY,
      title: "기관 현황 다운로드",
      description: `기관 ${exported.length.toLocaleString()}건의 현황이 엑셀 파일로 저장됩니다.`,
      rowCount: exported.length,
      onGranted: () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(exported.map(tenantExportRow)),
          "기관현황",
        );
        triggerXlsxDownload(workbook, `기관현황_${asOf}.xlsx`);
      },
    });
  }

  const s = summary.data;

  return (
    <div className="flex flex-col gap-6">
      {gate}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {s ? `${s.asOf} 기준` : ""}
        </span>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={includeInternal}
            onChange={(e) =>
              update({ [INCLUDE_PARAM]: e.target.checked ? "1" : null }, true)
            }
            className="size-4 accent-primary"
          />
          QA, 관리자 계정 포함
        </label>
      </div>

      {summary.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          합계를 불러오지 못했습니다: {summary.error.message}
        </p>
      )}
      {s && (
        <section
          aria-label="기관 합계"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard label="기관" value={s.tenantCount} />
          <StatCard
            label="학생"
            value={s.studentCount}
            note={
              s.studentWithoutEnrollmentCount > 0
                ? `학년, 반 미상 ${s.studentWithoutEnrollmentCount.toLocaleString()}명 포함`
                : undefined
            }
          />
          <StatCard label="선생님" value={s.teacherCount} />
          <StatCard label={CONTRACT_LABELS.active} value={s.contracts.active} />
          <StatCard label={CONTRACT_LABELS.trial} value={s.contracts.trial} />
          <StatCard
            label={CONTRACT_LABELS.ending_soon}
            value={s.contracts.endingSoon}
            note="종료일까지 30일 이하"
          />
          <StatCard label={CONTRACT_LABELS.grace} value={s.contracts.grace} />
          <StatCard
            label={CONTRACT_LABELS.expired}
            value={s.contracts.expired}
          />
        </section>
      )}

      <div className="bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 px-6 py-5">
          <Input
            aria-label="기관 검색"
            placeholder="기관 이름"
            value={params.q}
            onChange={(e) => update({ [PARAM.q]: e.target.value })}
            className="h-9 w-56 px-3 text-sm"
          />
          <NativeSelect
            aria-label="계약 상태"
            value={params.status ?? ""}
            onChange={(e) => update({ [PARAM.status]: e.target.value })}
          >
            <NativeSelectOption value="">전체</NativeSelectOption>
            {(Object.keys(CONTRACT_LABELS) as ContractStatus[]).map((key) => (
              <NativeSelectOption key={key} value={key}>
                {CONTRACT_LABELS[key]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="기관 유형"
            value={params.org ?? ""}
            onChange={(e) => update({ [PARAM.org]: e.target.value })}
          >
            <NativeSelectOption value="">전체</NativeSelectOption>
            {orgTypes.map((org) => (
              <NativeSelectOption key={org} value={org}>
                {org}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="ml-auto"
            onClick={requestExport}
          >
            <Download aria-hidden="true" />
            엑셀 다운로드
          </Button>
        </div>

        {tenants.isError && (
          <p
            role="alert"
            className="px-6 pb-4 text-sm font-medium text-destructive"
          >
            기관 현황을 불러오지 못했습니다: {tenants.error.message}
          </p>
        )}
        {tenants.isPending ? (
          <div
            role="status"
            className="p-12 text-center text-sm text-muted-foreground"
          >
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <Table className="min-w-[62.5rem]">
            <TableHeader>
              <TableRow className="bg-muted text-left hover:bg-transparent">
                {COLUMNS.map((col) => {
                  const active =
                    col.sort !== undefined && params.sort === col.sort;
                  return (
                    <TableHead
                      key={col.label}
                      scope="col"
                      className={`${HEAD} ${col.className ?? ""}`}
                      aria-sort={
                        active
                          ? params.dir === "desc"
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      {col.sort ? (
                        <button
                          type="button"
                          className="font-semibold hover:underline"
                          onClick={() => toggleSort(col.sort as SortKey)}
                        >
                          {col.label}
                        </button>
                      ) : (
                        col.label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.pageRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMNS.length}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    조건에 맞는 기관이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                table.pageRows.map((row) => (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer"
                    onClick={() => onSelectTenant(row.tenantId)}
                  >
                    <TableCell className="whitespace-normal px-4 py-3 font-medium">
                      <button
                        type="button"
                        aria-label={`${row.name} 읽기 전용으로 보기`}
                        className="text-left hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTenant(row.tenantId);
                        }}
                      >
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="px-4 py-3">{row.orgType}</TableCell>
                    <TableCell className="px-4 py-3">
                      {CONTRACT_LABELS[row.contractStatus]}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {contractPeriod(row)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {trialPeriod(row)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {row.studentCount.toLocaleString()}
                      {row.studentWithoutEnrollmentCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (학년, 반 미상 {row.studentWithoutEnrollmentCount})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {row.teacherCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {row.lastActivityOn ?? "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {row.goalRateAverage === null
                        ? "-"
                        : `${row.goalRateAverage}%`}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        {table.totalPages > 1 && (
          <AdminPagination
            page={table.page}
            totalPages={table.totalPages}
            onPageChange={(page) =>
              update({ [PARAM.page]: String(page) }, true)
            }
          />
        )}
      </div>
    </div>
  );
}
