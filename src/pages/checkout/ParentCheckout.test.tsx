import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import ParentCheckout from "./ParentCheckout";

const mocks = vi.hoisted(() => ({
  requestPayment: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// 재개 모드(수락 완료, 결제만 남음)로 고정해 쿠폰과 카탈로그 조회를 건너뛴다.
vi.mock("./useEnrollmentOrder", () => {
  const value = {
    order: {
      id: "o1",
      status: "pending",
      approval_status: "approved",
      order_name: "테스트 주문",
      list_amount: 10000,
      discount_amount: 0,
      amount: 10000,
      student_profile_id: null,
    },
    orderItems: [
      {
        id: 1,
        name: "상품",
        list_price: 10000,
        price: 10000,
        quantity: 1,
        product_id: "p1",
        service_key: "goal",
      },
    ],
    orderError: null,
    orderLoading: false,
    isResume: true,
    approvedOrder: { order_id: "o1", amount: 10000 },
    setApprovedOrder: vi.fn(),
  };
  return { useEnrollmentOrder: () => value };
});

vi.mock("./usePaymentAgreementHistory", () => ({
  usePaymentAgreementHistory: () => [true, vi.fn()],
}));

vi.mock("@/hooks/useTermsDocs", () => ({
  useTermsDocs: () => ({ docs: null, loading: false, error: null }),
}));

vi.mock("@/lib/products", () => ({
  filterOrgProducts: (services: unknown[]) => services,
  useMatchedTenantIds: () => ({ ids: [], loaded: true }),
  useProducts: () => ({ services: [], loading: false, error: null }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/toss", () => ({
  ANONYMOUS: "ANONYMOUS",
  getTossPayments: async () => ({
    payment: () => ({ requestPayment: mocks.requestPayment }),
  }),
}));

function renderCheckout() {
  render(
    <MemoryRouter initialEntries={["/checkout/parent?order=o1"]}>
      <ParentCheckout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestPayment.mockResolvedValue(undefined);
});

describe("ParentCheckout 결제 시작 이벤트", () => {
  it("가상계좌로 결제창을 열기 전에 checkout_start를 virtual_account로 보낸다", async () => {
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "가상계좌" }));
    fireEvent.click(screen.getByRole("button", { name: /결제하기$/ }));

    await waitFor(() => expect(mocks.requestPayment).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith("checkout_start", {
      method: "virtual_account",
    });
    expect(vi.mocked(trackEvent).mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestPayment.mock.invocationCallOrder[0] as number,
    );
  });

  it("카드로 결제창을 열기 전에 checkout_start를 card로 보낸다", async () => {
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "신용/체크카드" }));
    fireEvent.click(screen.getByRole("button", { name: /결제하기$/ }));

    await waitFor(() => expect(mocks.requestPayment).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith("checkout_start", {
      method: "card",
    });
    expect(vi.mocked(trackEvent).mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestPayment.mock.invocationCallOrder[0] as number,
    );
  });
});
