import { describe, expect, test } from "vitest";
import { formatDate } from "@/lib/time/format";
import type { HqTenantRow, HqUsageRow } from "./api";
import {
  applyTenantTable,
  readTenantTableParams,
  TENANT_PAGE_SIZE,
  tenantExportRow,
  usageExportColumns,
} from "./tenantTable";

function row(overrides: Partial<HqTenantRow> = {}): HqTenantRow {
  return {
    tenantId: "t",
    name: "한빛고",
    region: "서울",
    orgType: "학교",
    contractStartDate: "2026-03-01",
    contractEndDate: "2027-02-28",
    graceEnd: "2027-03-30",
    trialStartDate: null,
    trialEndDate: null,
    contractStatus: "active",
    studentCount: 10,
    studentWithoutEnrollmentCount: 0,
    teacherCount: 2,
    lastActivityAt: "2026-11-20T01:30:00.000Z",
    goalRateAverage: 50,
    goalUserCount: 4,
    ...overrides,
  };
}

const params = (query: string) =>
  readTenantTableParams(new URLSearchParams(query));

describe("readTenantTableParams", () => {
  test("비어 있으면 이름 오름차순 1쪽", () => {
    expect(params("")).toEqual({
      q: "",
      status: null,
      org: null,
      sort: "name",
      dir: "asc",
      page: 1,
    });
  });

  test("모르는 상태, 정렬, 쪽 값은 기본값으로 둔다", () => {
    expect(
      params("tenantStatus=bad&tenantSort=bad&tenantPage=-2&tenantDir=up"),
    ).toMatchObject({
      status: null,
      sort: "name",
      dir: "asc",
      page: 1,
    });
  });

  test("주소 값을 그대로 읽는다", () => {
    expect(
      params(
        "tenantQ=%ED%95%9C&tenantStatus=expired&tenantOrg=%ED%95%99%EC%9B%90&tenantSort=studentCount&tenantDir=desc&tenantPage=3",
      ),
    ).toEqual({
      q: "한",
      status: "expired",
      org: "학원",
      sort: "studentCount",
      dir: "desc",
      page: 3,
    });
  });
});

describe("applyTenantTable", () => {
  const rows = [
    row({
      tenantId: "a",
      name: "가람중",
      studentCount: 5,
      goalRateAverage: null,
      orgType: "학교",
    }),
    row({
      tenantId: "b",
      name: "나래학원",
      studentCount: 30,
      goalRateAverage: 80,
      orgType: "학원",
      contractStatus: "expired",
    }),
    row({
      tenantId: "c",
      name: "다온고",
      studentCount: 12,
      goalRateAverage: 40,
      orgType: "학교",
    }),
  ];

  test("이름 검색, 계약 상태, 기관 유형으로 거른다", () => {
    expect(
      applyTenantTable(rows, params("tenantQ=다온")).filtered.map(
        (r) => r.tenantId,
      ),
    ).toEqual(["c"]);
    expect(
      applyTenantTable(rows, params("tenantStatus=expired")).filtered.map(
        (r) => r.tenantId,
      ),
    ).toEqual(["b"]);
    expect(
      applyTenantTable(
        rows,
        params("tenantOrg=%ED%95%99%EA%B5%90"),
      ).filtered.map((r) => r.tenantId),
    ).toEqual(["a", "c"]);
  });

  test("숫자 열은 숫자로 정렬하고 내림차순도 된다", () => {
    expect(
      applyTenantTable(rows, params("tenantSort=studentCount")).filtered.map(
        (r) => r.tenantId,
      ),
    ).toEqual(["a", "c", "b"]);
    expect(
      applyTenantTable(
        rows,
        params("tenantSort=studentCount&tenantDir=desc"),
      ).filtered.map((r) => r.tenantId),
    ).toEqual(["b", "c", "a"]);
  });

  test("값이 없는 행은 방향과 무관하게 맨 뒤", () => {
    expect(
      applyTenantTable(rows, params("tenantSort=goalRateAverage")).filtered.map(
        (r) => r.tenantId,
      ),
    ).toEqual(["c", "b", "a"]);
    expect(
      applyTenantTable(
        rows,
        params("tenantSort=goalRateAverage&tenantDir=desc"),
      ).filtered.map((r) => r.tenantId),
    ).toEqual(["b", "c", "a"]);
  });

  test("쪽을 나누고, 마지막 쪽을 넘는 쪽 번호는 마지막 쪽으로 맞춘다", () => {
    const many = Array.from({ length: TENANT_PAGE_SIZE + 5 }, (_, i) =>
      row({ tenantId: String(i), name: `기관${String(i).padStart(2, "0")}` }),
    );
    const second = applyTenantTable(many, params("tenantPage=2"));
    expect(second.totalPages).toBe(2);
    expect(second.pageRows.map((r) => r.tenantId)).toEqual([
      "20",
      "21",
      "22",
      "23",
      "24",
    ]);
    expect(applyTenantTable(many, params("tenantPage=9")).page).toBe(2);
    expect(applyTenantTable([], params("")).totalPages).toBe(1);
  });
});

test("시범기간 기관: 상태 필터 값 trial 을 읽고 엑셀에 시범기간 중과 시범 날짜를 쓴다(결정 117)", () => {
  expect(params("tenantStatus=trial").status).toBe("trial");
  const trial = row({
    contractStatus: "trial",
    contractStartDate: null,
    contractEndDate: null,
    graceEnd: null,
    trialStartDate: "2026-11-20",
    trialEndDate: "2026-12-19",
  });
  expect(tenantExportRow(trial)).toMatchObject({
    계약상태: "시범기간 중",
    계약기간: "-",
    시범기간: "2026-11-20 ~ 2026-12-19",
  });
  expect(
    applyTenantTable(
      [row({ tenantId: "x" }), trial],
      params("tenantStatus=trial"),
    ).filtered,
  ).toEqual([trial]);
});

test("엑셀 행은 화면 표와 같은 열 이름과 한국어 상태를 쓴다", () => {
  expect(
    tenantExportRow(
      row({
        contractStatus: "ending_soon",
        studentWithoutEnrollmentCount: 3,
        lastActivityAt: null,
        goalRateAverage: null,
      }),
    ),
  ).toEqual({
    기관명: "한빛고",
    지역: "서울",
    기관유형: "학교",
    계약상태: "종료 임박",
    계약기간: "2026-03-01 ~ 2027-02-28",
    유예종료일: "2027-03-30",
    시범기간: "-",
    학생수: 10,
    "학년, 반 미상": 3,
    선생님수: 2,
    마지막활동일: "-",
    "목표 실행률 평균(%)": "-",
    목표관리학생수: 4,
  });
});

function usage(overrides: Partial<HqUsageRow> = {}): HqUsageRow {
  return {
    tenantId: "t",
    programKey: "diagnose",
    provided: true,
    monthLimit: 2,
    termLimit: 3,
    monthUsed: 4,
    monthCappedStudents: 2,
    termUsed: 5,
    termCappedStudents: 1,
    termResetsOn: "2027-02-15",
    ...overrides,
  };
}

describe("usageExportColumns", () => {
  test("5개 서비스마다 한도, 이번 달과 이번 학기 쓴 횟수, 한도 다 쓴 학생 수 열을 만든다", () => {
    const columns = usageExportColumns([
      usage(),
      usage({ programKey: "growth", monthLimit: null, termLimit: 1 }),
      usage({
        programKey: "suhaeng",
        provided: false,
        monthLimit: null,
        termLimit: null,
        monthUsed: 0,
        monthCappedStudents: 0,
        termUsed: 0,
        termCappedStudents: 0,
      }),
    ]);
    expect(columns).toMatchObject({
      "학습진단 한도": "월 2회, 학기 3회",
      "학습진단 이번 달 쓴 횟수": 4,
      "학습진단 이번 달 한도 다 쓴 학생": 2,
      "학습진단 이번 학기 쓴 횟수": 5,
      "학습진단 이번 학기 한도 다 쓴 학생": 1,
      "성장설계 한도": "학기 1회",
      "수행평가 한도": "제공 안 함",
      "수행평가 이번 달 쓴 횟수": 0,
    });
    // 행이 없는 서비스(심화탐구, 자기평가)도 열은 있고 값은 "-" 다.
    expect(columns["심화탐구 한도"]).toBe("-");
    expect(columns["자기평가 이번 학기 한도 다 쓴 학생"]).toBe("-");
    expect(Object.keys(columns)).toHaveLength(25);
  });

  test("사용량을 못 읽었으면(undefined) 모든 열이 -", () => {
    const columns = usageExportColumns(undefined);
    expect(Object.keys(columns)).toHaveLength(25);
    expect(new Set(Object.values(columns))).toEqual(new Set(["-"]));
  });

  test("제공하지만 한도가 없으면 무제한", () => {
    expect(
      usageExportColumns([usage({ monthLimit: null, termLimit: null })])[
        "학습진단 한도"
      ],
    ).toBe("무제한");
  });
});

test("엑셀 마지막활동일은 순간을 보는 사람 시간대의 날짜로 적는다", () => {
  const at = "2026-11-20T01:30:00.000Z";
  expect(tenantExportRow(row({ lastActivityAt: at })).마지막활동일).toBe(
    formatDate(at),
  );
});
