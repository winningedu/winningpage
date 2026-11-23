import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const gate = vi.hoisted(() => ({ requests: [] as Record<string, unknown>[] }));

vi.mock("./api", () => ({
  fetchHqSummary: vi.fn(),
  fetchHqTenants: vi.fn(),
  fetchHqUsage: vi.fn(),
}));
vi.mock("@/pages/admin/shared/xlsxDownload", () => ({
  triggerXlsxDownload: vi.fn(),
}));
vi.mock("@/pages/admin/shared/SensitiveActionGate", () => ({
  useSensitiveActionGate: () => ({
    requestAccess: (
      request: Record<string, unknown> & { onGranted: () => void },
    ) => {
      gate.requests.push(request);
      request.onGranted();
    },
    gate: null,
  }),
}));

import * as XLSX from "xlsx";
import { triggerXlsxDownload } from "@/pages/admin/shared/xlsxDownload";
import type { HqTenantRow, HqUsageRow } from "./api";
import * as api from "./api";
import TenantOverview from "./TenantOverview";

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
    lastActivityOn: "2026-11-20",
    goalRateAverage: 50,
    goalUserCount: 4,
    ...overrides,
  };
}

const ROWS = [
  row({ tenantId: "t-1", name: "가람중", studentCount: 5 }),
  row({
    tenantId: "t-2",
    name: "나래학원",
    orgType: "학원",
    contractStatus: "expired",
    studentCount: 30,
    studentWithoutEnrollmentCount: 4,
  }),
  row({ tenantId: "t-3", name: "다온고", studentCount: 12 }),
];

function usageRow(overrides: Partial<HqUsageRow> = {}): HqUsageRow {
  return {
    tenantId: "t-1",
    programKey: "diagnose",
    provided: true,
    monthLimit: 2,
    termLimit: 3,
    monthUsed: 7,
    monthCappedStudents: 2,
    termUsed: 11,
    termCappedStudents: 1,
    termResetsOn: "2027-02-15",
    ...overrides,
  };
}

const USAGE = [
  usageRow(),
  usageRow({
    programKey: "growth",
    provided: false,
    monthLimit: null,
    termLimit: null,
    monthUsed: 0,
    monthCappedStudents: 0,
    termUsed: 0,
    termCappedStudents: 0,
    termResetsOn: null,
  }),
];

function Location() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderAt(path: string, onSelectTenant = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/hqDashboard",
        element: (
          <>
            <TenantOverview onSelectTenant={onSelectTenant} />
            <Location />
          </>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { onSelectTenant };
}

const search = () =>
  new URLSearchParams(screen.getByTestId("search").textContent ?? "");
const tableNames = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]?.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  gate.requests = [];
  vi.mocked(api.fetchHqSummary).mockResolvedValue({
    asOf: "2026-11-23",
    tenantCount: 3,
    studentCount: 47,
    studentWithoutEnrollmentCount: 4,
    teacherCount: 6,
    contracts: {
      trial: 1,
      none: 0,
      upcoming: 0,
      active: 2,
      endingSoon: 1,
      grace: 0,
      expired: 1,
    },
  });
  vi.mocked(api.fetchHqTenants).mockResolvedValue({
    asOf: "2026-11-23",
    tenants: ROWS,
  });
  vi.mocked(api.fetchHqUsage).mockResolvedValue({
    asOf: "2026-11-23",
    usage: USAGE,
  });
});

describe("합계 카드", () => {
  test("기관, 학생, 선생님 수와 계약 상태별 기관 수를 보인다", async () => {
    renderAt("/admin/hqDashboard");
    const cards = await screen.findByRole("region", { name: "기관 합계" });
    expect(within(cards).getByText("기관").nextSibling?.textContent).toBe("3");
    expect(within(cards).getByText("학생").nextSibling?.textContent).toBe("47");
    expect(within(cards).getByText("학년, 반 미상 4명 포함")).toBeTruthy();
    expect(within(cards).getByText("선생님").nextSibling?.textContent).toBe(
      "6",
    );
    expect(within(cards).getByText("계약 중").nextSibling?.textContent).toBe(
      "2",
    );
    expect(within(cards).getByText("종료 임박").nextSibling?.textContent).toBe(
      "1",
    );
    expect(within(cards).getByText("유예 중").nextSibling?.textContent).toBe(
      "0",
    );
    expect(within(cards).getByText("계약 종료").nextSibling?.textContent).toBe(
      "1",
    );
    expect(screen.getByText("2026-11-23 기준")).toBeTruthy();
  });

  test("불러오지 못하면 오류를 보인다", async () => {
    vi.mocked(api.fetchHqSummary).mockRejectedValue(
      new Error("권한이 없습니다."),
    );
    renderAt("/admin/hqDashboard");
    expect(await screen.findByText(/합계를 불러오지 못했습니다/)).toBeTruthy();
  });
});

describe("시범기간(결정 117)", () => {
  test("합계 카드에 시범기간 중 기관 수를 보인다", async () => {
    renderAt("/admin/hqDashboard");
    const cards = await screen.findByRole("region", { name: "기관 합계" });
    expect(
      within(cards).getByText("시범기간 중").nextSibling?.textContent,
    ).toBe("1");
  });

  test("계약 상태 필터에 시범기간 중이 있고, 표에 상태와 시범 날짜를 보인다", async () => {
    vi.mocked(api.fetchHqTenants).mockResolvedValue({
      asOf: "2026-11-23",
      tenants: [
        ...ROWS,
        row({
          tenantId: "t-4",
          name: "라온고",
          contractStatus: "trial",
          contractStartDate: null,
          contractEndDate: null,
          trialStartDate: "2026-11-20",
          trialEndDate: "2026-12-19",
        }),
      ],
    });
    renderAt("/admin/hqDashboard");
    await screen.findByText("라온고");
    const select = screen.getByRole("combobox", {
      name: "계약 상태",
    }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain(
      "시범기간 중",
    );
    fireEvent.change(select, { target: { value: "trial" } });
    expect(search().get("tenantStatus")).toBe("trial");
    expect(tableNames()).toEqual(["라온고"]);
    const cells = within(screen.getAllByRole("row")[1] as HTMLElement)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toContain("시범기간 중");
    expect(cells).toContain("2026-11-20 ~ 2026-12-19");
  });
});

describe("QA, 관리자 계정 포함 스위치", () => {
  test("기본은 빼고 읽고, 켜면 주소에 includeInternal=1 을 두고 포함해서 다시 읽는다", async () => {
    renderAt("/admin/hqDashboard");
    await screen.findByText("가람중");
    expect(api.fetchHqSummary).toHaveBeenLastCalledWith(false);
    expect(api.fetchHqTenants).toHaveBeenLastCalledWith(false);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "QA, 관리자 계정 포함" }),
    );
    await waitFor(() =>
      expect(api.fetchHqTenants).toHaveBeenLastCalledWith(true),
    );
    expect(api.fetchHqSummary).toHaveBeenLastCalledWith(true);
    expect(search().get("includeInternal")).toBe("1");
  });

  test("주소에 includeInternal=1 이 있으면 켜진 채로 시작한다", async () => {
    renderAt("/admin/hqDashboard?includeInternal=1");
    await screen.findByText("가람중");
    expect(api.fetchHqTenants).toHaveBeenLastCalledWith(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "QA, 관리자 계정 포함",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});

describe("기관 표와 URL 검색 파라미터", () => {
  test("주소의 검색어와 상태 필터를 그대로 적용한다", async () => {
    renderAt("/admin/hqDashboard?tenantStatus=expired");
    await screen.findByText("나래학원");
    expect(tableNames()).toEqual(["나래학원"]);
    expect(
      (screen.getByRole("combobox", { name: "계약 상태" }) as HTMLSelectElement)
        .value,
    ).toBe("expired");
  });

  test("학적 없는 학생 수를 학년, 반 미상으로 함께 보인다", async () => {
    renderAt("/admin/hqDashboard");
    await screen.findByText("나래학원");
    expect(screen.getByText("(학년, 반 미상 4)")).toBeTruthy();
  });

  test("검색어를 넣으면 주소에 남고 쪽은 1로 돌아간다", async () => {
    renderAt("/admin/hqDashboard?tenantPage=2");
    await screen.findByText("가람중");
    fireEvent.change(screen.getByRole("textbox", { name: "기관 검색" }), {
      target: { value: "다온" },
    });
    expect(search().get("tenantQ")).toBe("다온");
    expect(search().get("tenantPage")).toBeNull();
    expect(tableNames()).toEqual(["다온고"]);
  });

  test("기관 유형 필터 목록은 받은 행에서 만든다", async () => {
    renderAt("/admin/hqDashboard");
    await screen.findByText("가람중");
    const select = screen.getByRole("combobox", {
      name: "기관 유형",
    }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "전체",
      "학교",
      "학원",
    ]);
    fireEvent.change(select, { target: { value: "학원" } });
    expect(search().get("tenantOrg")).toBe("학원");
    expect(tableNames()).toEqual(["나래학원"]);
  });

  test("열 제목을 누르면 정렬이 주소에 남고, 한 번 더 누르면 내림차순", async () => {
    renderAt("/admin/hqDashboard");
    await screen.findByText("가람중");
    fireEvent.click(screen.getByRole("button", { name: "학생 수" }));
    expect(search().get("tenantSort")).toBe("studentCount");
    expect(tableNames()).toEqual(["가람중", "다온고", "나래학원"]);
    fireEvent.click(screen.getByRole("button", { name: "학생 수" }));
    expect(search().get("tenantDir")).toBe("desc");
    expect(tableNames()).toEqual(["나래학원", "다온고", "가람중"]);
    expect(
      screen
        .getByRole("columnheader", { name: "학생 수" })
        .getAttribute("aria-sort"),
    ).toBe("descending");
  });

  test("20건을 넘으면 쪽을 나누고 쪽 번호는 주소에 남는다", async () => {
    vi.mocked(api.fetchHqTenants).mockResolvedValue({
      asOf: "2026-11-23",
      tenants: Array.from({ length: 25 }, (_, i) =>
        row({ tenantId: `t${i}`, name: `기관${String(i).padStart(2, "0")}` }),
      ),
    });
    renderAt("/admin/hqDashboard");
    await screen.findByText("기관00");
    expect(tableNames()).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "2페이지" }));
    expect(search().get("tenantPage")).toBe("2");
    expect(tableNames()).toEqual([
      "기관20",
      "기관21",
      "기관22",
      "기관23",
      "기관24",
    ]);
  });

  test("기관 이름을 누르면 그 기관 id 로 onSelectTenant 를 부른다(읽기 전용 대행 시작 자리)", async () => {
    const { onSelectTenant } = renderAt("/admin/hqDashboard");
    await screen.findByText("다온고");
    fireEvent.click(
      screen.getByRole("button", { name: "다온고 읽기 전용으로 보기" }),
    );
    expect(onSelectTenant).toHaveBeenCalledWith("t-3");
  });
});

describe("엑셀 다운로드", () => {
  test("사유와 비밀번호 확인(접근 로그)을 거친 뒤 거른 행 전체를 xlsx 로 저장한다", async () => {
    renderAt("/admin/hqDashboard?tenantOrg=%ED%95%99%EA%B5%90");
    await screen.findByText("가람중");
    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
    expect(gate.requests).toHaveLength(1);
    expect(gate.requests[0]).toMatchObject({
      action: "download",
      resourceKey: "hqDashboard",
      rowCount: 2,
    });
    expect(triggerXlsxDownload).toHaveBeenCalledTimes(1);
    const [workbook, fileName] = vi.mocked(triggerXlsxDownload).mock
      .calls[0] as [XLSX.WorkBook, string];
    expect(fileName).toBe("기관현황_2026-11-23.xlsx");
    const sheet = workbook.Sheets[
      workbook.SheetNames[0] as string
    ] as XLSX.WorkSheet;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows.map((r) => r.기관명)).toEqual(["가람중", "다온고"]);
  });

  test("내보낼 행이 없으면 게이트를 열지 않는다", async () => {
    renderAt("/admin/hqDashboard?tenantQ=%EC%97%86%EC%9D%8C");
    await screen.findByText("조건에 맞는 기관이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
    expect(gate.requests).toHaveLength(0);
  });
});

describe("서비스 사용량과 한도(Q6)", () => {
  test("기관 행의 사용량 보기를 누르면 서비스별 쓴 횟수와 한도 다 쓴 학생 수를 펼친다(대행으로 넘어가지 않는다)", async () => {
    const { onSelectTenant } = renderAt("/admin/hqDashboard");
    await screen.findByText("가람중");
    const toggle = screen.getByRole("button", {
      name: "가람중 서비스 사용량 보기",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(onSelectTenant).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const detail = await screen.findByRole("table", {
      name: "가람중 서비스 사용량",
    });
    const diagnose = within(detail).getByRole("row", { name: /학습진단/ });
    expect(
      within(diagnose)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual([
      "학습진단",
      "월 2회, 학기 3회",
      "7",
      "2명",
      "11",
      "1명",
      "2027-02-15",
    ]);
    const growth = within(detail).getByRole("row", { name: /성장설계/ });
    expect(within(growth).getAllByRole("cell")[1]?.textContent).toBe(
      "제공 안 함",
    );
    // 행이 없는 서비스도 5개 모두 보인다.
    expect(within(detail).getAllByRole("row")).toHaveLength(6);
    expect(within(detail).getByText(/2027-02-15/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("table", { name: "가람중 서비스 사용량" }),
    ).toBeNull();
  });

  test("사용량도 포함 스위치를 따라 읽는다", async () => {
    renderAt("/admin/hqDashboard?includeInternal=1");
    await screen.findByText("가람중");
    expect(api.fetchHqUsage).toHaveBeenLastCalledWith(true);
  });

  test("사용량을 불러오지 못하면 오류를 보이고 기관 표는 그대로 보인다", async () => {
    vi.mocked(api.fetchHqUsage).mockRejectedValue(new Error("boom"));
    renderAt("/admin/hqDashboard");
    expect(
      await screen.findByText(/서비스 사용량을 불러오지 못했습니다/),
    ).toBeTruthy();
    expect(tableNames()).toContain("가람중");
  });

  test("엑셀에 서비스별 사용량 열이 들어간다", async () => {
    renderAt("/admin/hqDashboard");
    await screen.findByText("가람중");
    // 사용량을 받은 뒤 내보낸다(펼친 표가 보이면 받은 것이다).
    fireEvent.click(
      screen.getByRole("button", { name: "가람중 서비스 사용량 보기" }),
    );
    await screen.findByRole("table", { name: "가람중 서비스 사용량" });
    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
    const [workbook] = vi.mocked(triggerXlsxDownload).mock.calls[0] as [
      XLSX.WorkBook,
      string,
    ];
    const sheet = workbook.Sheets[
      workbook.SheetNames[0] as string
    ] as XLSX.WorkSheet;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows[0]).toMatchObject({
      기관명: "가람중",
      "학습진단 이번 달 쓴 횟수": 7,
      "학습진단 이번 학기 한도 다 쓴 학생": 1,
      "성장설계 한도": "제공 안 함",
    });
    expect(rows[1]?.["학습진단 한도"]).toBe("-");
  });
});
