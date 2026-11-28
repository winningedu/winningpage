// 쿠폰 사용 이력 화면. 주소로 바로 열리고, 무효화는 사유와 함께 서버를 부른 뒤 이력과 목록을 새로 받는다.

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { couponKeys } from "./api";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { couponRow, listBody, renderCoupons } from "./testKit";

// 무효화 rpc 가 돌려주는 행. 목록 조회는 여기에 사용자 요약을 붙인다.
const redemptionRow = {
  id: 7,
  coupon_id: "c1",
  order_id: "order-1",
  user_id: "u1",
  discount_amount: 1000,
  created_at: "2026-08-02T01:00:00Z",
  voided_at: null,
  void_reason: null,
};
const redemption = {
  ...redemptionRow,
  user: { name: "홍길동", email: "hong@example.com" },
};

let rows: unknown[];

beforeEach(() => {
  resetApi();
  rows = [redemption];
  on("GET", "admin/coupons", listBody());
  on("GET", "admin/coupons/c1", couponRow);
  on("GET", "admin/coupons/c1/redemptions", () => ({ items: rows }));
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

const HISTORY_LABEL = "사용 이력을 불러오는 중입니다.";

// 첫 요청은 바로, 이후 요청은 release 를 부를 때까지 붙잡는다.
function holdAfterFirstHistory() {
  let release: () => void = () => {};
  let count = 0;
  on("GET", "admin/coupons/c1/redemptions", async () => {
    count += 1;
    if (count > 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return { items: rows };
  });
  return () => release();
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
  expect(callsTo("GET", "admin/coupons/c1")).toHaveLength(1);
  expect(callsTo("GET", "admin/coupons/c1/redemptions")).toHaveLength(1);
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
  on("POST", "admin/coupons/redemptions/7/void", () => {
    rows = [
      {
        ...redemption,
        voided_at: "2026-08-03T01:00:00Z",
        void_reason: "오발급",
      },
    ];
    return redemptionRow;
  });
  renderCoupons("/admin/coupons");
  fireEvent.click(await screen.findByRole("button", { name: "사용 이력" }));
  await startVoid("  오발급  ");

  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(
    callsTo("POST", "admin/coupons/redemptions/7/void")[0]?.options.json,
  ).toEqual({ reason: "오발급" });
  expect(callsTo("GET", "admin/coupons/c1/redemptions")).toHaveLength(2);
  expect(await screen.findByText("오발급")).toBeVisible();

  // 목록으로 돌아오면 사용 건수를 다시 받는다
  expect(callsTo("GET", "admin/coupons")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  await waitFor(() => expect(callsTo("GET", "admin/coupons")).toHaveLength(2));
});

test("사유를 비우면 reason 키 없이 보낸다", async () => {
  on("POST", "admin/coupons/redemptions/7/void", redemptionRow);
  renderCoupons("/admin/coupons/c1/history");
  await startVoid();
  await waitFor(() => expect(toastTexts().title).toBe("저장 완료"));
  expect(
    callsTo("POST", "admin/coupons/redemptions/7/void")[0]?.options.json,
  ).toEqual({});
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
    on("POST", "admin/coupons/redemptions/7/void", () => {
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
    "admin/coupons/redemptions/7/void",
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
  await act(async () => release(redemptionRow));
});

test("이력 조회에 실패하면 조회 실패 토스트가 보인다", async () => {
  on("GET", "admin/coupons/c1/redemptions", () => {
    throw new FakeApiError(404, "NOT_FOUND");
  });
  renderCoupons("/admin/coupons/c1/history");
  await waitFor(() => expect(toastTexts().title).toBe("쿠폰관리 조회 실패"));
  expect(toastTexts().description).toBe("잠시 후 다시 시도해 주세요.");
});

test("처음 받는 동안은 표 스켈레톤이 보이고 응답이 오면 행으로 바뀐다", async () => {
  let release: () => void = () => {};
  on("GET", "admin/coupons/c1/redemptions", async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { items: rows };
  });
  renderCoupons("/admin/coupons/c1/history");

  expect(
    await screen.findByRole("status", { name: HISTORY_LABEL }),
  ).toBeVisible();
  expect(screen.queryByText("홍길동")).toBeNull();

  release();
  expect(await screen.findByText("홍길동")).toBeVisible();
  expect(screen.queryByRole("status", { name: HISTORY_LABEL })).toBeNull();
});

test("창 포커스 같은 백그라운드 재조회는 행을 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
  const release = holdAfterFirstHistory();
  const { client } = renderCoupons("/admin/coupons/c1/history");
  await screen.findByText("홍길동");

  const refetching = client.refetchQueries({
    queryKey: couponKeys.redemptions("c1"),
  });
  await waitFor(() =>
    expect(callsTo("GET", "admin/coupons/c1/redemptions")).toHaveLength(2),
  );

  expect(screen.getByText("홍길동")).toBeVisible();
  expect(screen.queryByRole("status", { name: HISTORY_LABEL })).toBeNull();
  release();
  await refetching;
});

test("무효화하면 이력이 스켈레톤을 거쳐 새로 받은 행으로 바뀐다", async () => {
  on("POST", "admin/coupons/redemptions/7/void", redemptionRow);
  const release = holdAfterFirstHistory();
  renderCoupons("/admin/coupons/c1/history");
  await screen.findByText("홍길동");
  rows = [
    { ...redemption, voided_at: "2026-08-03T01:00:00Z", void_reason: "오발급" },
  ];

  await startVoid("오발급");

  expect(
    await screen.findByRole("status", { name: HISTORY_LABEL }),
  ).toBeVisible();
  expect(screen.queryByText("홍길동")).toBeNull();
  release();
  expect(await screen.findByText("오발급")).toBeVisible();
});

test("사용 이력 표는 이름 있는 스크롤 영역이고 관리 열은 오른쪽에 고정된다", async () => {
  renderCoupons("/admin/coupons/c1/history");

  const region = await screen.findByRole("region", { name: "사용 이력" });
  expect(region).toHaveAttribute("tabindex", "0");
  const header = screen.getByRole("columnheader", { name: "관리" });
  const cell = screen
    .getByRole("button", { name: "무효화" })
    .closest("td") as HTMLElement;
  for (const el of [header, cell]) {
    expect(el).toHaveClass("sticky", "right-0");
  }
});

test("쿠폰 머리글을 받는 동안은 머리글 자리에 대기 표시가 보이고 응답이 오면 쿠폰 정보로 바뀐다", async () => {
  let release: () => void = () => {};
  on("GET", "admin/coupons/c1", async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return couponRow;
  });
  renderCoupons("/admin/coupons/c1/history");

  expect(
    await screen.findByRole("status", {
      name: "쿠폰 정보를 불러오는 중입니다.",
    }),
  ).toBeVisible();

  release();
  expect(await screen.findByText("gift-1")).toBeVisible();
  expect(
    screen.queryByRole("status", { name: "쿠폰 정보를 불러오는 중입니다." }),
  ).toBeNull();
});
