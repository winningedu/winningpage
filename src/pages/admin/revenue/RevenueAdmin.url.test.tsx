// 매출 및 결제 화면의 URL 상태(service, from, to)와 보조 조회(서비스 탭, 환불 대기) 실패 처리.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/time/zone", () => ({
  browserTimeZone: () => "Asia/Seoul",
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get },
}));

import { ApiError } from "@/lib/http/client";
import RevenueAdmin from "./RevenueAdmin";

const item = (id: string, service: string, name: string) => ({
  order_item_id: id,
  order_id: `o-${id}`,
  paid_at: "2026-11-02T03:00:00Z",
  payer_name: name,
  payer_email: null,
  student_name: "학생",
  service_key: service,
  item_name: `${service} 상품`,
  list_amount: 1000,
  discount_amount: 0,
  paid_amount: 1000,
  refunded_amount: 0,
  revenue_status: "normal",
  net_amount: 1000,
});

const failure = () =>
  new ApiError({ status: 500, code: "INTERNAL_ERROR", detail: "서버 오류" });

const routes: Record<string, () => unknown> = {};

function resetRoutes() {
  routes["admin/revenue"] = () => ({
    items: [item("1", "goal", "목표결제자"), item("2", "mentor", "멘토결제자")],
  });
  routes["admin/revenue/services"] = () => ({
    items: [
      { key: "goal", label: "목표관리" },
      { key: "mentor", label: "콜멘토" },
    ],
  });
  routes["admin/revenue/pending"] = () => ({
    approvalWaiting: 3,
    processWaiting: 5,
  });
}

beforeEach(() => {
  resetRoutes();
  get.mockImplementation((path: string) => ({
    json: async () => routes[path]?.(),
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  get.mockReset();
  vi.restoreAllMocks();
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <RevenueAdmin />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const where = () => screen.getByTestId("where").textContent;

const revenueCalls = () =>
  get.mock.calls.filter(([path]) => path === "admin/revenue");

test("서비스 탭을 누르면 URL 에 service 가 쓰이고 전체로 돌아가면 지워진다", async () => {
  renderAt("/admin/revenue");
  await screen.findByText("목표결제자");

  fireEvent.click(await screen.findByRole("tab", { name: "콜멘토" }));

  expect(where()).toBe("/admin/revenue?service=mentor");
  expect(screen.queryByText("목표결제자")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "전체" }));

  expect(where()).toBe("/admin/revenue");
  expect(screen.getByText("목표결제자")).toBeInTheDocument();
});

test("조회 버튼은 from, to 를 URL 에 쓴다", async () => {
  renderAt("/admin/revenue?service=goal");
  await screen.findByText("목표결제자");

  fireEvent.change(screen.getByLabelText("조회 시작일"), {
    target: { value: "2026-11-01" },
  });
  fireEvent.change(screen.getByLabelText("조회 종료일"), {
    target: { value: "2026-11-30" },
  });
  expect(where()).toBe("/admin/revenue?service=goal");

  fireEvent.click(screen.getByRole("button", { name: "조회" }));

  await waitFor(() =>
    expect(where()).toBe(
      "/admin/revenue?service=goal&from=2026-11-01&to=2026-11-30",
    ),
  );
});

test("URL 의 service, from, to 로 새로고침하면 그 탭과 기간으로 조회한다", async () => {
  renderAt("/admin/revenue?service=mentor&from=2026-11-01&to=2026-11-30");

  expect(await screen.findByText("멘토결제자")).toBeInTheDocument();
  expect(screen.queryByText("목표결제자")).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "콜멘토" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("조회 시작일")).toHaveValue("2026-11-01");
  expect(screen.getByLabelText("조회 종료일")).toHaveValue("2026-11-30");
  expect(
    revenueCalls().some(
      ([, options]) =>
        options.searchParams.from === "2026-10-31T15:00:00.000Z" &&
        options.searchParams.to === "2026-11-30T15:00:00.000Z",
    ),
  ).toBe(true);
});

test("새로고침은 이번 달과 선택 기간을 다시 조회한다", async () => {
  renderAt("/admin/revenue?from=2026-11-01&to=2026-11-30");
  await screen.findByText("목표결제자");
  const before = revenueCalls().length;

  fireEvent.click(screen.getByRole("button", { name: "새로고침" }));

  await waitFor(() => expect(revenueCalls().length).toBe(before + 2));
});

test("환불 대기 건수를 대시보드에 보인다", async () => {
  renderAt("/admin/revenue");
  await screen.findByText("목표결제자");

  expect(get).toHaveBeenCalledWith(
    "admin/revenue/pending",
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(await screen.findByText("3건")).toBeInTheDocument();
  expect(screen.getByText("5건")).toBeInTheDocument();
});

test("환불 대기 조회가 실패하면 0 으로 두고 화면은 그대로다", async () => {
  routes["admin/revenue/pending"] = () => {
    throw failure();
  };
  renderAt("/admin/revenue");

  expect(await screen.findByText("목표결제자")).toBeInTheDocument();
  await waitFor(() =>
    expect(console.error).toHaveBeenCalledWith(
      "환불 대기 건수 조회 실패:",
      expect.anything(),
    ),
  );
});

test("서비스 목록 조회가 실패하면 전체 탭만 남는다", async () => {
  routes["admin/revenue/services"] = () => {
    throw failure();
  };
  renderAt("/admin/revenue");

  expect(await screen.findByText("목표결제자")).toBeInTheDocument();
  await waitFor(() =>
    expect(console.error).toHaveBeenCalledWith(
      "서비스 목록 조회 실패:",
      expect.anything(),
    ),
  );
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "전체",
  ]);
});

test("행 조회가 실패하면 서버 메시지와 함께 알린다", async () => {
  routes["admin/revenue"] = () => {
    throw failure();
  };
  renderAt("/admin/revenue");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "조회에 실패했습니다: 서버 오류",
  );
});
