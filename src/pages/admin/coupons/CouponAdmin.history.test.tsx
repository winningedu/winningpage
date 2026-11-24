// 쿠폰 사용 이력 화면. 주소로 바로 열리고, 무효화는 사유와 함께 서버를 부른 뒤 이력과 목록을 새로 받는다.

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { couponRow, listBody, renderCoupons } from "./testKit";

const redemption = {
  id: 7,
  coupon_id: "c1",
  order_id: "order-1",
  user_id: "u1",
  discount_amount: 1000,
  created_at: "2026-08-02T01:00:00Z",
  voided_at: null,
  void_reason: null,
  user: { name: "홍길동", email: "hong@example.com" },
};

let rows: unknown[];

beforeEach(() => {
  resetApi();
  rows = [redemption];
  on("GET", "admin/coupons", listBody());
  on("GET", "admin/coupons/detail", couponRow);
  on("GET", "admin/coupons/redemptions", () => ({ items: rows }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

function toastTexts() {
  return {
    title: document.querySelector('[data-slot="toast-title"]')?.textContent,
    description: document.querySelector('[data-slot="toast-description"]')
      ?.textContent,
  };
}

async function startVoid(reason?: string) {
  fireEvent.click(await screen.findByRole("button", { name: "무효화" }));
  if (reason !== undefined) {
    fireEvent.change(screen.getByRole("textbox", { name: "무효화 사유" }), {
      target: { value: reason },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
}

test("새로고침한 이력 주소가 쿠폰 머리글과 사용 이력을 id 로 받아 그린다", async () => {
  renderCoupons("/admin/coupons/c1/history");

  expect(await screen.findByText("홍길동")).toBeVisible();
  expect(screen.getByText("gift-1")).toBeVisible();
  expect(screen.getByText("order-1")).toBeVisible();
  expect(
    callsTo("GET", "admin/coupons/detail")[0]?.options.searchParams,
  ).toEqual({
    id: "c1",
  });
  expect(
    callsTo("GET", "admin/coupons/redemptions")[0]?.options.searchParams,
  ).toEqual({ couponId: "c1" });
});

test("목록의 사용 이력 버튼으로 들어가고 목록으로 버튼으로 돌아온다", async () => {
  const { router } = renderCoupons("/admin/coupons");
  fireEvent.click(await screen.findByRole("button", { name: "사용 이력" }));
  await screen.findByText("홍길동");
  expect(router.state.location.pathname).toBe("/admin/coupons/c1/history");

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/coupons"),
  );
});

test("무효화는 사유와 함께 서버를 부르고 이력과 목록을 새로 받는다", async () => {
  on("POST", "admin/coupons/redemption-void", () => {
    rows = [
      {
        ...redemption,
        voided_at: "2026-08-03T01:00:00Z",
        void_reason: "오발급",
      },
    ];
    return { id: 7 };
  });
  renderCoupons("/admin/coupons");
  fireEvent.click(await screen.findByRole("button", { name: "사용 이력" }));
  await startVoid("  오발급  ");

  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(
    callsTo("POST", "admin/coupons/redemption-void")[0]?.options.json,
  ).toEqual({ redemptionId: 7, reason: "오발급" });
  expect(callsTo("GET", "admin/coupons/redemptions")).toHaveLength(2);
  expect(await screen.findByText("오발급")).toBeVisible();

  // 목록으로 돌아오면 사용 건수를 다시 받는다
  expect(callsTo("GET", "admin/coupons")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  await waitFor(() => expect(callsTo("GET", "admin/coupons")).toHaveLength(2));
});

test("사유를 비우면 reason 키 없이 보낸다", async () => {
  on("POST", "admin/coupons/redemption-void", { id: 7 });
  renderCoupons("/admin/coupons/c1/history");
  await startVoid();
  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(
    callsTo("POST", "admin/coupons/redemption-void")[0]?.options.json,
  ).toEqual({
    redemptionId: 7,
  });
});

test("무효화 오류 코드는 예전 문구로 보이고 입력은 남는다", async () => {
  const cases: [string, number, string][] = [
    ["FORBIDDEN", 403, "관리자 권한이 없습니다."],
    [
      "REDEMPTION_ALREADY_VOIDED",
      409,
      "이미 무효화되었거나 존재하지 않는 사용 이력입니다.",
    ],
    ["WHATEVER", 500, "알 수 없는 오류가 발생했습니다."],
  ];
  for (const [code, status, text] of cases) {
    toast.close();
    on("POST", "admin/coupons/redemption-void", () => {
      throw new FakeApiError(status, code);
    });
    const view = renderCoupons("/admin/coupons/c1/history");
    await startVoid("x");
    await waitFor(() => expect(toastTexts().title).toBe("수정 실패"));
    expect(toastTexts().description).toBe(text);
    expect(screen.getByRole("textbox", { name: "무효화 사유" })).toHaveValue(
      "x",
    );
    view.unmount();
  }
});

test("요청 중에는 확인 버튼이 잠긴다", async () => {
  let release: (value: unknown) => void = () => {};
  on(
    "POST",
    "admin/coupons/redemption-void",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  renderCoupons("/admin/coupons/c1/history");
  await startVoid("x");

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled(),
  );
  await act(async () => release({ id: 7 }));
});

test("이력 조회에 실패하면 조회 실패 토스트가 보인다", async () => {
  on("GET", "admin/coupons/redemptions", () => {
    throw new FakeApiError(404, "NOT_FOUND");
  });
  renderCoupons("/admin/coupons/c1/history");
  await waitFor(() => expect(toastTexts().title).toBe("쿠폰관리 조회 실패"));
  expect(toastTexts().description).toBe("잠시 후 다시 시도해 주세요.");
});
