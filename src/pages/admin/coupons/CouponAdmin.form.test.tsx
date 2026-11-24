// 쿠폰 등록 수정 화면. 주소로 바로 열리고, 저장과 오류 문구와 이탈 확인이 예전과 같다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { couponRow, listBody, renderCoupons } from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", "admin/coupons", listBody());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

async function openCreate() {
  const view = renderCoupons("/admin/coupons/new");
  await screen.findByText("쿠폰 키");
  return view;
}

function toastTexts() {
  return {
    title: document.querySelector('[data-slot="toast-title"]')?.textContent,
    description: document.querySelector('[data-slot="toast-description"]')
      ?.textContent,
  };
}

// 조건형 쿠폰 최소 입력: 쿠폰 키, 이름, 할인 금액, 사용 기한 무제한, 총 발행 수량 무제한
function fillRequired() {
  fireEvent.change(screen.getByRole("textbox", { name: "쿠폰 키" }), {
    target: { value: "new-slug" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "쿠폰 이름" }), {
    target: { value: "새 쿠폰" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "할인 금액" }), {
    target: { value: "2000" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "사용 기한 무제한" }));
  fireEvent.click(screen.getByRole("radio", { name: "총 발행 수량 무제한" }));
}

test("이름 없던 체크박스와 입력에 한국어 이름이 있다", async () => {
  await openCreate();

  expect(screen.getByRole("checkbox", { name: "중복 사용" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "가입 시 자동 발급" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "쿠폰 이름" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "고객 입력 코드" })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "할인 금액" })).toBeVisible();
  expect(
    screen.getByRole("spinbutton", { name: "최소 결제 금액" }),
  ).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "소속(단체 쿠폰)" }),
  ).toBeVisible();
});

test("할인 금액 입력은 숫자만 남기고 문자열로 유지한다", async () => {
  await openCreate();
  const input = screen.getByRole("spinbutton", { name: "할인 금액" });

  fireEvent.change(input, { target: { value: "1200" } });
  expect(input).toHaveValue(1200);
  expect(screen.getByText("1,200원")).toBeVisible();
});

test("총 발행 수량은 무제한을 고르면 값을 비우고 입력을 잠근다", async () => {
  await openCreate();
  const unlimited = screen.getByRole("radio", { name: "총 발행 수량 무제한" });
  const valueMode = screen.getByRole("radio", { name: "총 발행 수량 값 지정" });
  const input = screen.getByRole("spinbutton", { name: "총 발행 수량" });

  fireEvent.click(valueMode);
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value: "30" } });
  expect(input).toHaveValue(30);

  fireEvent.click(unlimited);
  expect(input).toBeDisabled();
  expect(input).toHaveValue(null);

  fireEvent.click(valueMode);
  expect(input).toBeEnabled();
  expect(input).toHaveValue(null);
});

test("소속 선택지는 목록 응답의 tenants 로 채운다", async () => {
  on(
    "GET",
    "admin/coupons",
    listBody({ tenants: [{ id: "t1", name: "윈 학원" }] }),
  );
  await openCreate();
  expect(await screen.findByRole("option", { name: "윈 학원" })).toBeVisible();
});

test("수정 주소를 새로고침해도 쿠폰을 id 로 받아 폼을 채운다", async () => {
  on("GET", "admin/coupons/detail", {
    ...couponRow,
    title: "서버에서 받은 이름",
  });
  renderCoupons("/admin/coupons/c1/edit");

  expect(await screen.findByDisplayValue("서버에서 받은 이름")).toBeVisible();
  expect(screen.getByDisplayValue("gift-1")).toBeVisible();
  expect(
    callsTo("GET", "admin/coupons/detail")[0]?.options.searchParams,
  ).toEqual({
    id: "c1",
  });
});

test("등록 저장은 payload 를 POST 하고 목록으로 돌아온다", async () => {
  on("POST", "admin/coupons", couponRow);
  const { router } = await openCreate();
  fillRequired();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/coupons"),
  );
  expect(callsTo("POST", "admin/coupons")[0]?.options.json).toEqual({
    slug: "new-slug",
    code: null,
    tenant_id: null,
    title: "새 쿠폰",
    discount_amount: 2000,
    min_amount: 0,
    is_active: true,
    stackable: false,
    grant_type: "auto",
    grant_on_signup: false,
    valid_until: null,
    max_uses_per_user: null,
    max_redemptions: null,
  });
  expect(toastTexts().title).toBe("저장 완료");
  // 저장 뒤 목록을 다시 받는다
  await waitFor(() =>
    expect(callsTo("GET", "admin/coupons").length).toBeGreaterThan(1),
  );
});

test("수정 저장은 id 를 query 로 PATCH 한다", async () => {
  on("GET", "admin/coupons/detail", couponRow);
  on("PATCH", "admin/coupons/detail", couponRow);
  const { router } = renderCoupons("/admin/coupons/c1/edit");
  const title = await screen.findByRole("textbox", { name: "쿠폰 이름" });
  fireEvent.change(title, { target: { value: "바뀐 이름" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/coupons"),
  );
  const patch = callsTo("PATCH", "admin/coupons/detail")[0];
  expect(patch?.options.searchParams).toEqual({ id: "c1" });
  expect(patch?.options.json).toMatchObject({
    title: "바뀐 이름",
    slug: "gift-1",
  });
});

test("저장 오류 코드는 예전 문구로 보인다", async () => {
  const CHECK =
    "할인 금액\u00b7최소 결제 금액을 확인해 주세요. 할인 금액은 0보다 커야 하고, 최소 결제 금액은 0 이상이어야 합니다.";
  const CAP =
    "배포 방식과 1인당 사용 횟수가 맞지 않습니다. 발급형은 1인당 사용 횟수가 1이어야 하고, 조건형은 무제한이어야 합니다.";
  const cases: [string, number, string][] = [
    ["COUPON_CHECK_FAILED", 422, CHECK],
    ["COUPON_CAP_MISMATCH", 422, CAP],
    ["COUPON_DUPLICATE", 409, "알 수 없는 오류가 발생했습니다."],
  ];
  for (const [code, status, text] of cases) {
    toast.close();
    resetApi();
    on("GET", "admin/coupons", listBody());
    on("POST", "admin/coupons", () => {
      throw new FakeApiError(status, code);
    });
    const view = await openCreate();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(toastTexts().title).toBe("등록 실패"));
    expect(toastTexts().description).toBe(text);
    // 실패하면 폼에 머문다
    expect(screen.getByRole("textbox", { name: "쿠폰 키" })).toHaveValue(
      "new-slug",
    );
    view.unmount();
  }
});

test("수정 저장이 실패하면 제목은 수정 실패다", async () => {
  on("GET", "admin/coupons/detail", couponRow);
  on("PATCH", "admin/coupons/detail", () => {
    throw new FakeApiError(409, "COUPON_DUPLICATE");
  });
  renderCoupons("/admin/coupons/c1/edit");
  const title = await screen.findByRole("textbox", { name: "쿠폰 이름" });
  fireEvent.change(title, { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(toastTexts().title).toBe("수정 실패"));
});

test("목록의 쿠폰 키와 겹치면 저장 전에 막는다", async () => {
  on("POST", "admin/coupons", couponRow);
  await openCreate();
  await screen.findByRole("textbox", { name: "쿠폰 키" });
  fillRequired();
  fireEvent.change(screen.getByRole("textbox", { name: "쿠폰 키" }), {
    target: { value: "gift-1" },
  });
  await screen.findByText("이미 사용 중인 쿠폰 키입니다.");
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(toastTexts().title).toBe("이미 사용 중인 쿠폰 키입니다."),
  );
  expect(callsTo("POST", "admin/coupons")).toHaveLength(0);
});

test("목록에서 등록으로 들어간 뒤 뒤로가기는 목록으로 돌아온다", async () => {
  const { router } = renderCoupons("/admin/coupons");
  fireEvent.click(await screen.findByRole("button", { name: "등록" }));
  await screen.findByText("쿠폰 키");
  expect(router.state.location.pathname).toBe("/admin/coupons/new");

  await router.navigate(-1);
  expect(await screen.findByRole("button", { name: "등록" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/admin/coupons");
});

test("없는 하위 주소는 목록으로 바꿔 보낸다", async () => {
  const { router } = renderCoupons("/admin/coupons/nowhere/x/y");
  expect(await screen.findByRole("button", { name: "등록" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/admin/coupons");
});

test("고친 폼을 두고 나가면 확인을 묻고 취소하면 폼이 남는다", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { router } = await openCreate();
  fireEvent.change(screen.getByRole("textbox", { name: "쿠폰 이름" }), {
    target: { value: "쓰던 중" },
  });

  await router.navigate("/admin/other");
  await waitFor(() =>
    expect(confirmSpy).toHaveBeenCalledWith(
      "저장하지 않은 변경사항이 있습니다. 나가시겠습니까?",
    ),
  );
  expect(router.state.location.pathname).toBe("/admin/coupons/new");
  expect(screen.getByRole("textbox", { name: "쿠폰 이름" })).toHaveValue(
    "쓰던 중",
  );

  confirmSpy.mockReturnValue(true);
  await router.navigate("/admin/other");
  expect(await screen.findByText("다른 화면")).toBeVisible();
});

test("고치지 않은 폼은 묻지 않고 나간다", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { router } = await openCreate();
  await router.navigate("/admin/other");
  expect(await screen.findByText("다른 화면")).toBeVisible();
  expect(confirmSpy).not.toHaveBeenCalled();
});
