import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import { usePaymentConfirmation } from "./usePaymentConfirmation";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: mocks.apiFetch,
  getAuthHeader: async () => ({}),
}));
vi.mock("@/lib/cart", () => ({ clearCart: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

function respond(body: Record<string, unknown>) {
  mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => body });
}

function confirm() {
  return renderHook(() =>
    usePaymentConfirmation({ paymentKey: "pk", orderId: "o1", amount: "1000" }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePaymentConfirmation 결제 완료 이벤트", () => {
  it.each([
    ["카드", "card"],
    ["간편결제", "easy_pay"],
    ["계좌이체", "transfer"],
    ["휴대폰", "other"],
  ])(
    "승인(DONE)된 %s 결제는 payment_complete를 %s로 보낸다",
    async (tossMethod, method) => {
      respond({ status: "DONE", method: tossMethod });
      const { result } = confirm();

      await waitFor(() => expect(result.current.status).toBe("done"));
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("payment_complete", { method });
    },
  );

  it("가상계좌 입금 대기(WAITING_FOR_DEPOSIT)는 완료로 세지 않는다", async () => {
    respond({ status: "WAITING_FOR_DEPOSIT", method: "가상계좌" });
    const { result } = confirm();

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("승인이 실패하면 보내지 않는다", async () => {
    respond({ error: "거절" });
    const { result } = confirm();

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
