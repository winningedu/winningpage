// 기관 현황 표의 검색, 필터, 정렬, 쪽 나누기(계획 4번 A8)와 엑셀 행(A9). 상태는 모두 URL 검색 파라미터에 둔다.
// 대시보드의 다른 표와 겹치지 않게 키에 tenant 를 붙인다.

import type { ContractStatus, HqTenantRow, HqUsageRow } from "./api";

export const TENANT_PAGE_SIZE = 20;

export const CONTRACT_LABELS: Record<ContractStatus, string> = {
  none: "계약 정보 없음",
  upcoming: "계약 전",
  trial: "시범기간 중",
  active: "계약 중",
  ending_soon: "종료 임박",
  grace: "유예 중",
  expired: "계약 종료",
};

export const SORT_KEYS = [
  "name",
  "contractEndDate",
  "studentCount",
  "teacherCount",
  "lastActivityOn",
  "goalRateAverage",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const PARAM = {
  q: "tenantQ",
  status: "tenantStatus",
  org: "tenantOrg",
  sort: "tenantSort",
  dir: "tenantDir",
  page: "tenantPage",
} as const;

export interface TenantTableParams {
  q: string;
  status: ContractStatus | null;
  org: string | null;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
}

export function readTenantTableParams(
  params: URLSearchParams,
): TenantTableParams {
  const status = params.get(PARAM.status);
  const sort = params.get(PARAM.sort);
  const page = Number(params.get(PARAM.page));
  return {
    q: params.get(PARAM.q) ?? "",
    status:
      status !== null && status in CONTRACT_LABELS
        ? (status as ContractStatus)
        : null,
    org: params.get(PARAM.org) || null,
    sort: SORT_KEYS.find((key) => key === sort) ?? "name",
    dir: params.get(PARAM.dir) === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function compare(a: HqTenantRow, b: HqTenantRow, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "ko");
}

/** 거른 뒤 정렬한 전체 행(엑셀이 쓴다)과 지금 쪽의 행. 값이 없는(null) 행은 방향과 무관하게 맨 뒤다. */
export function applyTenantTable(
  rows: HqTenantRow[],
  params: TenantTableParams,
): {
  filtered: HqTenantRow[];
  pageRows: HqTenantRow[];
  totalPages: number;
  page: number;
} {
  const q = params.q.trim().toLowerCase();
  const sign = params.dir === "desc" ? -1 : 1;
  const filtered = rows
    .filter(
      (row) =>
        (q === "" || row.name.toLowerCase().includes(q)) &&
        (params.status === null || row.contractStatus === params.status) &&
        (params.org === null || row.orgType === params.org),
    )
    .sort((a, b) => {
      const aNull = a[params.sort] === null;
      const bNull = b[params.sort] === null;
      if (aNull || bNull) return Number(aNull) - Number(bNull);
      return sign * compare(a, b, params.sort);
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / TENANT_PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  return {
    filtered,
    pageRows: filtered.slice(
      (page - 1) * TENANT_PAGE_SIZE,
      page * TENANT_PAGE_SIZE,
    ),
    totalPages,
    page,
  };
}

export function contractPeriod(row: HqTenantRow): string {
  if (!row.contractStartDate && !row.contractEndDate) return "-";
  return `${row.contractStartDate ?? ""} ~ ${row.contractEndDate ?? ""}`.trim();
}

export function trialPeriod(row: HqTenantRow): string {
  if (!row.trialStartDate || !row.trialEndDate) return "-";
  return `${row.trialStartDate} ~ ${row.trialEndDate}`;
}

/** 엑셀 한 행. 열 이름은 화면 표와 같다. */
export function tenantExportRow(
  row: HqTenantRow,
): Record<string, string | number> {
  return {
    기관명: row.name,
    지역: row.region,
    기관유형: row.orgType,
    계약상태: CONTRACT_LABELS[row.contractStatus],
    계약기간: contractPeriod(row),
    유예종료일: row.graceEnd ?? "-",
    시범기간: trialPeriod(row),
    학생수: row.studentCount,
    "학년, 반 미상": row.studentWithoutEnrollmentCount,
    선생님수: row.teacherCount,
    마지막활동일: row.lastActivityOn ?? "-",
    "목표 실행률 평균(%)": row.goalRateAverage ?? "-",
    목표관리학생수: row.goalUserCount,
  };
}

/** 사용량 표와 엑셀의 서비스 순서와 이름(목표관리 제외 5개, Q6). */
export const USAGE_PROGRAMS: { programKey: string; label: string }[] = [
  { programKey: "diagnose", label: "학습진단" },
  { programKey: "growth", label: "성장설계" },
  { programKey: "suhaeng", label: "수행평가" },
  { programKey: "inquiry", label: "심화탐구" },
  { programKey: "selfeval", label: "자기평가" },
];

/** 기관 설정 한도 글. 꺼져 있거나 설정이 없으면 "제공 안 함", 한도가 둘 다 없으면 "무제한". */
export function usageLimitLabel(row: HqUsageRow): string {
  if (!row.provided) return "제공 안 함";
  const parts = [
    row.monthLimit === null ? null : `월 ${row.monthLimit}회`,
    row.termLimit === null ? null : `학기 ${row.termLimit}회`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? "무제한" : parts.join(", ");
}

/** 엑셀에 붙일 서비스별 사용량 열. 사용량을 못 읽었거나 그 서비스 행이 없으면 "-". */
export function usageExportColumns(
  usage: HqUsageRow[] | undefined,
): Record<string, string | number> {
  const columns: Record<string, string | number> = {};
  for (const { programKey, label } of USAGE_PROGRAMS) {
    const row = usage?.find((u) => u.programKey === programKey);
    columns[`${label} 한도`] = row ? usageLimitLabel(row) : "-";
    columns[`${label} 이번 달 쓴 횟수`] = row?.monthUsed ?? "-";
    columns[`${label} 이번 달 한도 다 쓴 학생`] =
      row?.monthCappedStudents ?? "-";
    columns[`${label} 이번 학기 쓴 횟수`] = row?.termUsed ?? "-";
    columns[`${label} 이번 학기 한도 다 쓴 학생`] =
      row?.termCappedStudents ?? "-";
  }
  return columns;
}
