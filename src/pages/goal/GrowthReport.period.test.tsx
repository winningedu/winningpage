// 리포트 기간 선택 배선. 드롭다운에서 고른 기간이 `at` 쿼리로 올라가 같은 fetch 경로로 다시
// 조회되는지, 탭을 바꾸면 `at`이 버려지는지 본다. 본문 렌더(GrowthReportBody)는 별도 테스트가
// 맡으므로 여기서는 얇은 대역으로 바꾼다.
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchReportMock } = vi.hoisted(() => ({ fetchReportMock: vi.fn() }));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student1" }),
}));
vi.mock("@/lib/goalApi", () => ({
  fetchGoalReport: fetchReportMock,
  fetchGoalStudent: vi.fn(async () => ({ kind: "not-onboarded" })),
}));
vi.mock("@/components/goal/report/GrowthReportBody", () => ({
  default: (props: {
    period: string;
    onPeriodChange: (p: "weekly" | "monthly") => void;
    report: { activePeriod: string; periodOptions: { value: string }[] };
    onPeriodKeyChange: (key: string) => void;
    activePeriod: string;
  }) => (
    <div>
      <span data-testid="active">{props.activePeriod}</span>
      <button
        type="button"
        onClick={() => props.onPeriodKeyChange("2026-11-09")}
      >
        pick-past
      </button>
      <button type="button" onClick={() => props.onPeriodChange("monthly")}>
        tab-monthly
      </button>
    </div>
  ),
}));

import GrowthReport from "./GrowthReport";

function Probe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <GrowthReport />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GrowthReport 기간 선택", () => {
  beforeEach(() => {
    fetchReportMock.mockImplementation(async (_type: string, at?: string) => ({
      kind: "success",
      report: {
        activePeriod: at ?? "2026-11-23",
        periodOptions: [{ value: "2026-11-23", label: "이번 주" }],
      },
    }));
  });
  afterEach(() => {
    cleanup();
    fetchReportMock.mockReset();
  });

  it("옵션을 고르면 at 쿼리가 바뀌고 그 기간으로 다시 조회한다", async () => {
    renderAt("/goal/report?period=weekly");
    fireEvent.click(await screen.findByText("pick-past"));

    expect(await screen.findByText("2026-11-09")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent(
      "period=weekly&at=2026-11-09",
    );
    expect(fetchReportMock).toHaveBeenLastCalledWith("weekly", "2026-11-09");
  });

  it("탭을 바꾸면 at을 버린다", async () => {
    renderAt("/goal/report?period=weekly&at=2026-11-09");
    fireEvent.click(await screen.findByText("tab-monthly"));

    expect(await screen.findByTestId("active")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?period=monthly");
    expect(screen.getByTestId("search")).not.toHaveTextContent("at=");
    expect(fetchReportMock).toHaveBeenLastCalledWith("monthly", undefined);
  });
});
