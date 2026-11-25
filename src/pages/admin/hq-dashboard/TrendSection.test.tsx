import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ fetchHqTrends: vi.fn() }));

const zone = vi.hoisted(() => ({ current: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time/zone")>()),
  browserTimeZone: () => zone.current,
}));

import type { HqTrendsResponse } from "./api";
import * as api from "./api";
import TrendSection from "./TrendSection";

const DATA: HqTrendsResponse = {
  from: "2026-11-01",
  to: "2026-11-23",
  grain: "week",
  mauMode: "calendar",
  includeInternal: false,
  series: [
    {
      start: "2026-11-01",
      end: "2026-11-01",
      signups: 0,
      signupsByMemberType: {},
      paidOrders: 0,
    },
    {
      start: "2026-11-02",
      end: "2026-11-08",
      signups: 7,
      signupsByMemberType: { student: 5, parent: 2 },
      paidOrders: 3,
    },
  ],
};

function renderPage(path = "/admin/hqDashboard") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TrendSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastSearch = (fn: unknown) => {
  const calls = vi.mocked(fn as (s: string) => unknown).mock.calls;
  return String(calls[calls.length - 1]?.[0]);
};

beforeEach(() => {
  zone.current = "Asia/Seoul";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  vi.mocked(api.fetchHqTrends).mockResolvedValue(DATA);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("TrendSection", () => {
  test("기간 선택은 따로 없고 로그인 이용의 주소 필터(기간, 묶음, MAU 기준, 포함 스위치)로 부른다", async () => {
    renderPage(
      "/admin/hqDashboard?loginFrom=2026-11-01&loginGrain=week&includeInternal=1",
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "가입과 결제 추이" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.fetchHqTrends).toHaveBeenCalled());
    expect(lastSearch(api.fetchHqTrends)).toBe(
      "from=2026-11-01&to=2026-11-23&grain=week&mau=calendar&includeInternal=1",
    );
    expect(screen.queryByLabelText("시작일")).not.toBeInTheDocument();
  });

  test("기본 기간의 오늘은 브라우저 시간대 기준이다(서울 11/24 05:00 은 로스앤젤레스 11/23)", async () => {
    vi.setSystemTime(new Date("2026-11-23T20:00:00Z"));
    zone.current = "America/Los_Angeles";

    renderPage();

    await waitFor(() => expect(api.fetchHqTrends).toHaveBeenCalled());
    expect(lastSearch(api.fetchHqTrends)).toBe(
      "from=2026-11-01&to=2026-11-23&grain=day&mau=calendar&includeInternal=0",
    );
  });

  test("묶음마다 기간, 새 가입, 유형별 가입, 결제 주문을 표로 보여 준다", async () => {
    renderPage();

    const table = await screen.findByRole("table", {
      name: "기간별 가입과 결제",
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const second = within(rows[1] as HTMLElement);
    expect(second.getByText("2026-11-02 ~ 2026-11-08")).toBeInTheDocument();
    expect(second.getByText("7")).toBeInTheDocument();
    expect(second.getByText("학생 5, 학부모 2")).toBeInTheDocument();
    expect(second.getByText("3")).toBeInTheDocument();
  });

  test("조회가 실패하면 오류를 알린다", async () => {
    vi.mocked(api.fetchHqTrends).mockRejectedValue(new Error("추이 실패"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("추이 실패");
  });
});
