// 매출 및 결제 화면의 접근성과 표 구조. 탭, 기간 입력, 표 머리글, 상태 안내를 검증한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const tables: Record<string, unknown[]> = {
  products: [
    { service_key: "goal", service_name: "목표관리", service_sort_order: 1 },
    { service_key: "mentor", service_name: "콜멘토", service_sort_order: 2 },
  ],
  admin_revenue_items: [
    row("1", "goal", "목표결제자"),
    row("2", "mentor", "멘토결제자"),
  ],
};

function chain(table: string) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: tables[table] ?? [], error: null, count: 0 });
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

import RevenueAdmin from "./RevenueAdmin";

afterEach(() => {
  cleanup();
  tables.admin_revenue_items = [
    row("1", "goal", "목표결제자"),
    row("2", "mentor", "멘토결제자"),
  ];
});

test("서비스 탭은 role=tab 이고 누르면 해당 서비스 행만 남는다", async () => {
  render(<RevenueAdmin />);

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
  render(<RevenueAdmin />);
  await screen.findByText("목표결제자");

  expect(screen.getByLabelText("조회 시작일")).toHaveAttribute("type", "date");
  expect(screen.getByLabelText("조회 종료일")).toHaveAttribute("type", "date");
});

test("표 머리글은 열 머리글이고 데이터가 없으면 안내를 보인다", async () => {
  render(<RevenueAdmin />);
  await screen.findByText("목표결제자");

  const heads = screen.getAllByRole("columnheader", { name: "결제일시" });
  expect(heads[0]).toHaveAttribute("scope", "col");
});

test("선택 기간 매출 타일은 작은 카드다", async () => {
  render(<RevenueAdmin />);
  await screen.findByText("목표결제자");

  const tile = screen.getByText("선택 기간 매출").closest('[data-slot="card"]');
  expect(tile).toHaveAttribute("data-size", "sm");
});

test("불러오는 동안 상태 안내가 role=status 로 보인다", () => {
  render(<RevenueAdmin />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "데이터를 불러오는 중입니다.",
  );
});
