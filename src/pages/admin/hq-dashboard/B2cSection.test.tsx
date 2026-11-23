import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const flags = vi.hoisted(() => ({ hqB2cView: true }));
vi.mock("@/config/site", () => ({ site: { features: flags } }));
vi.mock("./api", () => ({ fetchLoginStats: vi.fn(), fetchHqB2c: vi.fn() }));

import type { HqB2cResponse, LoginStatsResponse } from "./api";
import * as api from "./api";
import B2cSection from "./B2cSection";

const STATS: LoginStatsResponse = {
  ok: true,
  from: "2026-11-01",
  to: "2026-11-23",
  grain: "day",
  mauMode: "calendar",
  includeInternal: false,
  firstMeasuredOn: "2026-11-23",
  series: [],
  dau: {
    from: "2026-11-01",
    to: "2026-11-23",
    average: 4.2,
    source: "estimated",
  },
  mau: {
    from: "2026-11-01",
    to: "2026-11-23",
    mode: "calendar",
    members: 88,
    source: "estimated",
    byMemberType: { student: 80, parent: 8 },
  },
};

const SUMMARY: HqB2cResponse = {
  ok: true,
  from: "2026-11-01",
  to: "2026-11-23",
  includeInternal: false,
  members: { total: 1234, byMemberType: { student: 1000, parent: 234 } },
  payments: {
    payingMembers: 12,
    orderCount: 15,
    paidAmount: 540000,
    refundedAmount: 18000,
    netAmount: 522000,
  },
};

function renderPage(path = "/admin/hqDashboard") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <B2cSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastSearch = (fn: unknown) => {
  const calls = vi.mocked(fn as (s: string) => unknown).mock.calls;
  return String(calls[calls.length - 1]?.[0]);
};

beforeEach(() => {
  flags.hqB2cView = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  vi.mocked(api.fetchLoginStats).mockResolvedValue(STATS);
  vi.mocked(api.fetchHqB2c).mockResolvedValue(SUMMARY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("B2cSection", () => {
  test("B2C 화면 스위치가 꺼진 사이트(스쿨멘토)는 아무것도 그리지 않고 부르지 않는다", () => {
    flags.hqB2cView = false;

    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
    expect(api.fetchLoginStats).not.toHaveBeenCalled();
    expect(api.fetchHqB2c).not.toHaveBeenCalled();
  });

  test("로그인 이용의 주소 필터로 B2C 로그인 통계(scope=b2c)와 B2C 요약을 부른다", async () => {
    renderPage("/admin/hqDashboard?loginTo=2026-11-20&includeInternal=1");

    expect(
      screen.getByRole("heading", { level: 2, name: "위닝 B2C 회원" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.fetchHqB2c).toHaveBeenCalled());
    expect(lastSearch(api.fetchLoginStats)).toBe(
      "view=stats&from=2026-11-01&to=2026-11-20&grain=day&mau=calendar&scope=b2c&includeInternal=1",
    );
    expect(lastSearch(api.fetchHqB2c)).toBe(
      "from=2026-11-01&to=2026-11-20&includeInternal=1",
    );
  });

  test("회원 수(유형별), B2C DAU, MAU, 결제 회원과 금액을 카드로 보여 준다", async () => {
    renderPage();

    const members = await screen.findByRole("region", { name: "B2C 회원" });
    expect(within(members).getByText("1,234")).toBeInTheDocument();
    expect(
      within(members).getByText("학생 1000, 학부모 234"),
    ).toBeInTheDocument();

    const dau = await screen.findByRole("region", { name: "B2C DAU 일평균" });
    expect(within(dau).getByText("4.2")).toBeInTheDocument();
    expect(within(dau).getByText("추정")).toBeInTheDocument();
    const mau = screen.getByRole("region", { name: "B2C MAU 달력 기준" });
    expect(within(mau).getByText("88")).toBeInTheDocument();

    const paying = screen.getByRole("region", { name: "결제 회원" });
    expect(within(paying).getByText("12")).toBeInTheDocument();
    expect(within(paying).getByText("주문 15건")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "결제 금액" })).getByText(
        "540,000원",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "환불 금액" })).getByText(
        "18,000원",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "순매출" })).getByText(
        "522,000원",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("2026-11-01 ~ 2026-11-23").length,
    ).toBeGreaterThan(0);
  });

  test("요약 조회가 실패하면 오류를 알린다", async () => {
    vi.mocked(api.fetchHqB2c).mockRejectedValue(new Error("요약 실패"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("요약 실패");
  });
});
