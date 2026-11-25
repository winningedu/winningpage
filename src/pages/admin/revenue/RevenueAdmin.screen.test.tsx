// 매출 및 결제 화면의 접근성과 표 구조. 탭, 기간 입력, 표 머리글, 상태 안내를 검증한다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";

const row = (id: string, service: string, name: string) => ({
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

const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get },
}));

let revenueItems: unknown[] = [];
// 값이 있으면 매출 행 응답이 이 약속이 풀릴 때까지 늦어진다.
let hold: Promise<void> | null = null;

function mockApi() {
  revenueItems = [
    row("1", "goal", "목표결제자"),
    row("2", "mentor", "멘토결제자"),
  ];
  get.mockImplementation((path: string) => ({
    json: async () => {
      if (path === "admin/revenue") {
        if (hold) await hold;
        return { items: revenueItems };
      }
      if (path === "admin/revenue/services")
        return {
          items: [
            { key: "goal", label: "목표관리" },
            { key: "mentor", label: "콜멘토" },
          ],
        };
      return { approvalWaiting: 0, processWaiting: 0 };
    },
  }));
}

import RevenueAdmin from "./RevenueAdmin";

function renderScreen() {
  mockApi();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RevenueAdmin />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

function holdResponses() {
  let release: () => void = () => {};
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

const TABLE_LABEL = "매출 및 결제 목록을 불러오는 중입니다.";
const CARDS_LABEL = "매출 요약을 불러오는 중입니다.";

afterEach(() => {
  cleanup();
  get.mockReset();
  hold = null;
});

test("서비스 탭은 role=tab 이고 누르면 해당 서비스 행만 남는다", async () => {
  renderScreen();

  expect(await screen.findByText("목표결제자")).toBeInTheDocument();
  expect(screen.getByText("멘토결제자")).toBeInTheDocument();

  fireEvent.click(await screen.findByRole("tab", { name: "콜멘토" }));

  expect(screen.queryByText("목표결제자")).not.toBeInTheDocument();
  expect(screen.getByText("멘토결제자")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "콜멘토" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("기간 날짜 입력에 이름이 있다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  expect(screen.getByLabelText("조회 시작일")).toHaveAttribute("type", "date");
  expect(screen.getByLabelText("조회 종료일")).toHaveAttribute("type", "date");
});

test("표 머리글은 열 머리글이고 데이터가 없으면 안내를 보인다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  const heads = screen.getAllByRole("columnheader", { name: "결제일시" });
  expect(heads[0]).toHaveAttribute("scope", "col");
});

test("선택 기간 매출 타일은 작은 카드다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  const tile = screen.getByText("선택 기간 매출").closest('[data-slot="card"]');
  expect(tile).toHaveAttribute("data-size", "sm");
});

test("불러오는 동안 표와 요약 카드 자리에 스켈레톤이 role=status 로 보인다", async () => {
  holdResponses();
  renderScreen();

  const table = screen.getByRole("status", { name: TABLE_LABEL });
  // 번호 없이 머리글 8칸과 같은 열 수다.
  expect(table.querySelector('[data-part="header"]')?.children).toHaveLength(8);
  const cards = screen.getByRole("status", { name: CARDS_LABEL });
  expect(cards.querySelectorAll('[data-part="card"]')).toHaveLength(4);
  // 응답 전에 0원 카드를 보이지 않는다.
  expect(screen.queryByText("선택 기간 매출")).toBeNull();
  expect(screen.queryByText("0원")).toBeNull();
});

test("창 포커스 같은 배경 재조회는 행과 카드를 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
  const { client } = renderScreen();
  await screen.findByText("목표결제자");

  holdResponses();
  void client.refetchQueries({ queryKey: ["admin", "revenue", "rows"] });
  await waitFor(() =>
    expect(
      get.mock.calls.filter(([path]) => path === "admin/revenue").length,
    ).toBeGreaterThan(1),
  );

  expect(screen.getByText("목표결제자")).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: TABLE_LABEL })).toBeNull();
  expect(screen.queryByRole("status", { name: CARDS_LABEL })).toBeNull();
});

test("새로고침을 누르면 스켈레톤을 보인 뒤 새 행을 보인다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  const release = holdResponses();
  revenueItems = [row("3", "goal", "새결제자")];
  fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
  expect(
    await screen.findByRole("status", { name: TABLE_LABEL }),
  ).toBeInTheDocument();
  expect(screen.queryByText("목표결제자")).toBeNull();

  release();
  expect(await screen.findByText("새결제자")).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: TABLE_LABEL })).toBeNull();
});

test("같은 기간으로 조회를 다시 눌러도 스켈레톤을 거쳐 새 행을 보인다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  const release = holdResponses();
  revenueItems = [row("4", "goal", "다시결제자")];
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  expect(
    await screen.findByRole("status", { name: TABLE_LABEL }),
  ).toBeInTheDocument();
  expect(screen.queryByText("목표결제자")).toBeNull();

  release();
  expect(await screen.findByText("다시결제자")).toBeInTheDocument();
});

test("다른 기간으로 조회하면 스켈레톤을 보인 뒤 그 기간 행을 보인다", async () => {
  renderScreen();
  await screen.findByText("목표결제자");

  const release = holdResponses();
  revenueItems = [row("5", "goal", "지난달결제자")];
  fireEvent.change(screen.getByLabelText("조회 시작일"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  expect(
    await screen.findByRole("status", { name: TABLE_LABEL }),
  ).toBeInTheDocument();
  expect(screen.queryByText("목표결제자")).toBeNull();

  release();
  expect(await screen.findByText("지난달결제자")).toBeInTheDocument();
});
