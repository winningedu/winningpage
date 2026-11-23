import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import PaymentSuccess from "./PaymentSuccess";

const mocks = vi.hoisted(() => ({
  confirmation: {} as Record<string, unknown>,
}));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/usePaymentConfirmation", () => ({
  usePaymentConfirmation: () => mocks.confirmation,
}));
vi.mock("@/hooks/useMemberType", () => ({
  useMemberType: () => ({ kind: "student" }),
}));
vi.mock("@/hooks/useSignupEnabled", () => ({
  useSignupEnabled: () => false,
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/payment/success?orderId=o1&amount=1000"]}>
      <PaymentSuccess />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentSuccess 카카오 문의 클릭 이벤트", () => {
  it("승인 확인이 지연된 화면의 문의 링크는 payment로 보낸다", () => {
    mocks.confirmation = { status: "error", errorMsg: "x", payment: null };
    renderPage();

    fireEvent.click(
      screen.getByRole("link", { name: "카카오톡으로 문의하기" }),
    );

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "payment",
    });
  });

  it("이용 등록 확인이 필요한 화면의 문의 링크는 payment로 보낸다", () => {
    mocks.confirmation = {
      status: "done",
      errorMsg: "",
      payment: {
        status: "DONE",
        totalAmount: 1000,
        access: { ok: false, error: "order_not_found" },
      },
    };
    renderPage();

    fireEvent.click(
      screen.getByRole("link", { name: "카카오톡으로 문의하기" }),
    );

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "payment",
    });
  });
});
