// 쿠폰 발급 관리 화면. 주소로 바로 열리고, 사용자 검색과 발급과 회수는 서버를 부른 뒤 발급 목록을 새로 받는다.

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

const grant = {
  id: 5,
  coupon_id: "c1",
  user_id: "u1",
  granted_at: "2026-08-02T01:00:00Z",
  granted_by: "admin",
  valid_until: null,
  revoked_at: null,
  revoke_reason: null,
  user: { name: "홍길동", email: "hong@example.com" },
};
const found = [
  { id: "u1", name: "홍길동", email: "hong@example.com" },
  { id: "u2", name: "김철수", email: "kim@example.com" },
];

let grants: unknown[];

beforeEach(() => {
  resetApi();
  grants = [grant];
  on("GET", "admin/coupons", listBody());
  on("GET", "admin/coupons/c1", couponRow);
  on("GET", "admin/coupons/grants", () => ({ items: grants }));
  on("GET", "admin/coupons/user-search", { items: found });
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

async function search(text: string) {
  const input = await screen.findByPlaceholderText("이메일로 검색");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
}

test("새로고침한 발급 주소가 쿠폰 머리글과 발급 목록을 id 로 받아 그린다", async () => {
  renderCoupons("/admin/coupons/c1/grants");

  expect(await screen.findByText("홍길동")).toBeVisible();
  expect(screen.getByText("gift-1")).toBeVisible();
  expect(callsTo("GET", "admin/coupons/c1")).toHaveLength(1);
  expect(
    callsTo("GET", "admin/coupons/grants")[0]?.options.searchParams,
  ).toEqual({
    couponId: "c1",
  });
});

test("목록의 발급 이력 버튼으로 들어간다", async () => {
  const { router } = renderCoupons("/admin/coupons");
  fireEvent.click(await screen.findByRole("button", { name: "발급 이력" }));
  await screen.findByPlaceholderText("이메일로 검색");
  expect(router.state.location.pathname).toBe("/admin/coupons/c1/grants");
});

test("검색어는 필터 문법 문자를 걷어내고 보내며 이미 발급된 사용자는 표시만 한다", async () => {
  renderCoupons("/admin/coupons/c1/grants");
  await search(" ho,ng(*) ");

  expect(await screen.findByText("김철수")).toBeVisible();
  expect(
    callsTo("GET", "admin/coupons/user-search")[0]?.options.searchParams,
  ).toEqual({
    q: "hong",
  });
  // u1 은 살아있는 발급이 있어 버튼 대신 표시만 있다
  expect(
    screen.getByRole("img", { name: "이미 발급된 사용자입니다." }),
  ).toBeVisible();
  expect(screen.getAllByRole("button", { name: "등록" })).toHaveLength(1);
});

test("걷어내고 비면 요청하지 않는다", async () => {
  renderCoupons("/admin/coupons/c1/grants");
  await search(" ,() ");
  await screen.findByText("gift-1");
  expect(callsTo("GET", "admin/coupons/user-search")).toHaveLength(0);
});

test("검색에 실패하면 조회 실패 토스트와 빈 결과가 보인다", async () => {
  on("GET", "admin/coupons/user-search", () => {
    throw new FakeApiError(500, "INTERNAL_ERROR");
  });
  renderCoupons("/admin/coupons/c1/grants");
  await search("kim");
  await waitFor(() => expect(toastTexts().title).toBe("쿠폰관리 조회 실패"));
  expect(toastTexts().description).toBe("잠시 후 다시 시도해 주세요.");
});

test("발급은 쿠폰과 사용자 id 를 보내고 발급 목록을 새로 받는다", async () => {
  on("POST", "admin/coupons/grants", () => {
    grants = [
      {
        ...grant,
        id: 6,
        user_id: "u2",
        user: { name: "김철수", email: "kim@example.com" },
      },
      grant,
    ];
    return { id: 6 };
  });
  renderCoupons("/admin/coupons/c1/grants");
  await search("kim");
  fireEvent.click(await screen.findByRole("button", { name: "등록" }));

  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(callsTo("POST", "admin/coupons/grants")[0]?.options.json).toEqual({
    couponId: "c1",
    userId: "u2",
  });
  expect(callsTo("GET", "admin/coupons/grants")).toHaveLength(2);
  // 방금 발급한 사용자도 표시만 남는다
  await waitFor(() =>
    expect(
      screen.getAllByRole("img", { name: "이미 발급된 사용자입니다." }),
    ).toHaveLength(2),
  );
});

test("발급 오류 코드는 예전 문구로 보인다", async () => {
  const cases: [string, number, string][] = [
    ["FORBIDDEN", 403, "관리자 권한이 없습니다."],
    ["COUPON_NOT_GRANTABLE", 422, "발급할 수 없는 쿠폰입니다."],
    ["COUPON_ALREADY_REDEEMED", 409, "알 수 없는 오류가 발생했습니다."],
  ];
  for (const [code, status, text] of cases) {
    toast.close();
    on("POST", "admin/coupons/grants", () => {
      throw new FakeApiError(status, code);
    });
    const view = renderCoupons("/admin/coupons/c1/grants");
    await search("kim");
    fireEvent.click(await screen.findByRole("button", { name: "등록" }));
    await waitFor(() => expect(toastTexts().title).toBe("등록 실패"));
    expect(toastTexts().description).toBe(text);
    view.unmount();
  }
});

test("회수는 사유와 함께 서버를 부르고 발급 목록을 새로 받는다", async () => {
  on("POST", "admin/coupons/grant-revoke", () => {
    grants = [
      {
        ...grant,
        revoked_at: "2026-08-03T01:00:00Z",
        revoke_reason: "잘못 줌",
      },
    ];
    return { id: 5 };
  });
  renderCoupons("/admin/coupons/c1/grants");
  fireEvent.click(await screen.findByRole("button", { name: "회수" }));
  fireEvent.change(screen.getByRole("textbox", { name: "회수 사유" }), {
    target: { value: " 잘못 줌 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "확인" }));

  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(
    callsTo("POST", "admin/coupons/grant-revoke")[0]?.options.json,
  ).toEqual({
    grantId: 5,
    reason: "잘못 줌",
  });
  expect(callsTo("GET", "admin/coupons/grants")).toHaveLength(2);
  expect(await screen.findByText("잘못 줌")).toBeVisible();
});

test("회수 오류 코드는 예전 문구로 보이고 요청 중에는 확인이 잠긴다", async () => {
  let release: (error: unknown) => void = () => {};
  on(
    "POST",
    "admin/coupons/grant-revoke",
    () =>
      new Promise((_resolve, reject) => {
        release = reject;
      }),
  );
  renderCoupons("/admin/coupons/c1/grants");
  fireEvent.click(await screen.findByRole("button", { name: "회수" }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled(),
  );

  await act(async () =>
    release(new FakeApiError(409, "GRANT_ALREADY_REVOKED")),
  );
  await waitFor(() => expect(toastTexts().title).toBe("수정 실패"));
  expect(toastTexts().description).toBe(
    "이미 회수되었거나 존재하지 않는 발급입니다.",
  );
  expect(screen.getByRole("button", { name: "확인" })).toBeEnabled();
});

test("조합 중 Enter는 사용자 조회를 부르지 않고 조합이 끝난 Enter는 부른다", async () => {
  renderCoupons("/admin/coupons/c1/grants");
  const input = await screen.findByPlaceholderText("이메일로 검색");
  fireEvent.change(input, { target: { value: "홍길" } });

  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(callsTo("GET", "admin/coupons/user-search")).toHaveLength(0);

  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(callsTo("GET", "admin/coupons/user-search")).toHaveLength(1),
  );
});
