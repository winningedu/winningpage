import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ fetchWebAnalytics: vi.fn() }));

import * as api from "./api";
import WebAnalyticsAdmin from "./WebAnalyticsAdmin";

const REPORT: api.WebAnalyticsReport = {
  range: { from: "2026-11-01", to: "2026-11-07" },
  totals: { pageviews: 1200, visitors: 340 },
  topPages: [
    { path: "/", pageviews: 500, visitors: 200 },
    { path: "/services/growth", pageviews: 120, visitors: 60 },
  ],
  events: [
    {
      name: "report_export",
      count: 9,
      visitors: 5,
      breakdowns: [
        { property: "service", values: [{ value: "growth", count: 7 }] },
        {
          property: "method",
          values: [
            { value: "pdf", count: 6 },
            { value: "copy", count: 3 },
          ],
        },
      ],
    },
    { name: "consult_apply", count: 0, visitors: 0, breakdowns: [] },
  ],
};

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.search}</output>
      <button
        type="button"
        onClick={() =>
          navigate("/admin/webAnalytics?from=2026-09-01&to=2026-09-30")
        }
      >
        다른 기간 링크
      </button>
    </>
  );
}

function renderPage(search = "") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/webAnalytics${search}`]}>
        <WebAnalyticsAdmin />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchWebAnalytics).mockResolvedValue({
    ok: true,
    data: REPORT,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WebAnalyticsAdmin", () => {
  test("URL 기간으로 불러와 기간, 방문 카드, 많이 본 페이지를 보여 준다", async () => {
    renderPage("?from=2026-11-01&to=2026-11-07");

    expect(
      screen.getByRole("heading", { level: 1, name: "방문 분석" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-11-01 ~ 2026-11-07/)).toBeInTheDocument();
    expect(await screen.findByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("페이지 조회 수")).toBeInTheDocument();
    expect(screen.getByText("방문자 수")).toBeInTheDocument();
    const pages = screen.getByRole("table", { name: "많이 본 페이지" });
    expect(within(pages).getByText("/services/growth")).toBeInTheDocument();
    expect(within(pages).getByText("500")).toBeInTheDocument();
    expect(api.fetchWebAnalytics).toHaveBeenCalledWith({
      from: "2026-11-01",
      to: "2026-11-07",
    });
  });

  test("이벤트 표에 한글 이름, 횟수, 방문자, 속성별 나눔을 보여 준다", async () => {
    renderPage("?from=2026-11-01&to=2026-11-07");

    const table = await screen.findByRole("table", { name: "이벤트 횟수" });
    const row = within(table).getByText("보고서 내보내기").closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("9")).toBeInTheDocument();
    expect(cells.getByText("5")).toBeInTheDocument();
    expect(cells.getByText("서비스: 성장설계 7")).toBeInTheDocument();
    expect(cells.getByText("방식: PDF 6, 복사 3")).toBeInTheDocument();
    const empty = within(table).getByText("상담 신청").closest("tr");
    expect(within(empty as HTMLElement).getAllByText("0")).toHaveLength(2);
    for (const header of ["이벤트", "횟수", "방문자", "속성별 나눔"]) {
      expect(
        within(table).getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  test("URL 에 기간이 없으면 한국 날짜 기준 최근 7일을 불러오고 기간을 보여 준다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-11-23 00:30 KST = 2026-11-22 15:30 UTC
    vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));

    renderPage();

    await waitFor(() =>
      expect(api.fetchWebAnalytics).toHaveBeenCalledWith({
        from: "2026-11-17",
        to: "2026-11-23",
      }),
    );
    expect(screen.getByText(/2026-11-17 ~ 2026-11-23/)).toBeInTheDocument();
  });

  test("조회를 누르면 기간이 URL 검색 파라미터에 들어가고 다시 불러온다", async () => {
    renderPage("?from=2026-11-01&to=2026-11-07");
    await screen.findByText("1,200");

    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    await waitFor(() =>
      expect(api.fetchWebAnalytics).toHaveBeenCalledWith({
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    );
    const search = new URLSearchParams(
      screen.getByTestId("location").textContent ?? "",
    );
    expect(search.get("from")).toBe("2026-10-01");
    expect(search.get("to")).toBe("2026-10-31");
  });

  test("URL 기간이 바깥에서 바뀌면 날짜 입력도 그 기간을 보여 준다", async () => {
    renderPage("?from=2026-11-01&to=2026-11-07");
    await screen.findByText("1,200");

    fireEvent.click(screen.getByRole("button", { name: "다른 기간 링크" }));

    await waitFor(() =>
      expect(screen.getByLabelText("시작일")).toHaveValue("2026-09-01"),
    );
    expect(screen.getByLabelText("종료일")).toHaveValue("2026-09-30");
  });

  test("API 오류 문구를 alert 로 보여 주고 숫자는 그리지 않는다", async () => {
    vi.mocked(api.fetchWebAnalytics).mockResolvedValue({
      ok: false,
      message: "방문 분석 설정이 없어요",
    });

    renderPage("?from=2026-11-01&to=2026-11-07");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "방문 분석 설정이 없어요",
    );
    expect(screen.queryByText("페이지 조회 수")).not.toBeInTheDocument();
    expect(screen.getByText(/2026-11-01 ~ 2026-11-07/)).toBeInTheDocument();
  });
});
