// 쿠폰 목록 표. 헤더 범위, 고정 관리 칸, 아이콘 버튼 이름, 부가 조회 열화를 확인한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { couponKeys } from "./api";
import { callsTo, on, resetApi } from "./fakeApi";
import { couponRow, listBody, renderCoupons } from "./testKit";

const LIST_LABEL = "쿠폰 목록을 불러오는 중입니다.";

// 첫 요청은 바로, 이후 요청은 release 를 부를 때까지 붙잡는다.
function holdAfterFirstList(next: unknown) {
  let release: () => void = () => {};
  let count = 0;
  on("GET", "admin/coupons", async () => {
    count += 1;
    if (count === 1) return listBody();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return next;
  });
  return () => release();
}

beforeEach(() => {
  resetApi();
  on("GET", "admin/coupons", listBody());
});

test("목록 헤더는 열 범위를 갖고 관리 칸은 고정되며 행 hover 색이 맞는다", async () => {
  renderCoupons();
  const edit = await screen.findByRole("button", { name: "수정" });

  const headers = screen.getAllByRole("columnheader");
  for (const header of headers) expect(header).toHaveAttribute("scope", "col");

  const sticky = edit.closest("td");
  expect(sticky).toHaveClass("sticky", "right-0", "group-hover:bg-muted");
  expect(edit.closest("tr")).toHaveClass("group");
  expect(callsTo("GET", "admin/coupons")).toHaveLength(1);
});

test("목록 표는 이름 붙은 가로 스크롤 영역 안에 있고 낱말 단위로 줄바꿈한다", async () => {
  renderCoupons();
  const edit = await screen.findByRole("button", { name: "수정" });

  const region = screen.getByRole("region", { name: "쿠폰 목록" });
  expect(region).toContainElement(edit);
  expect(edit.closest("table")).toHaveClass("break-keep");
});

test("금액 열은 머리글과 칸이 오른쪽 정렬이고 금액이 한 줄로 고정폭 숫자다", async () => {
  renderCoupons();
  await screen.findByRole("button", { name: "수정" });

  const headers = screen.getAllByRole("columnheader");
  const row = screen.getAllByRole("row")[1] as HTMLElement;
  const cells = row.querySelectorAll("td");
  for (const name of ["할인 금액", "최소 결제 금액"]) {
    const header = screen.getByRole("columnheader", { name });
    expect(header).toHaveClass("text-right");
    const cell = cells[headers.indexOf(header)];
    expect(cell).toHaveClass("text-right", "whitespace-nowrap", "tabular-nums");
  }
});

test("사용 건수, 발급 이력 버튼 게이트, 열화(null)가 예전과 같다", async () => {
  on(
    "GET",
    "admin/coupons",
    listBody({
      items: [
        { ...(listBody().items[0] as object), id: "c1", grant_type: "auto" },
      ],
      redemptionStats: {
        byCoupon: { c1: { active: 2, total: 3 } },
        truncated: true,
      },
      grantedCouponIds: ["c1"],
    }),
  );
  const first = renderCoupons();
  expect(await screen.findByText("2 / 3+")).toBeVisible();
  expect(screen.getByRole("button", { name: "발급 이력" })).toBeVisible();
  first.unmount();

  on(
    "GET",
    "admin/coupons",
    listBody({
      items: [
        { ...(listBody().items[0] as object), id: "c1", grant_type: "auto" },
      ],
      redemptionStats: null,
      grantedCouponIds: null,
      tenants: null,
    }),
  );
  renderCoupons();
  expect(await screen.findByText("0 / 0")).toBeVisible();
  expect(screen.queryByRole("button", { name: "발급 이력" })).toBeNull();
});

test("처음 받는 동안은 표 스켈레톤이 보이고 응답이 오면 행으로 바뀐다", async () => {
  let release: () => void = () => {};
  on("GET", "admin/coupons", async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return listBody();
  });
  renderCoupons();

  expect(await screen.findByRole("status", { name: LIST_LABEL })).toBeVisible();
  expect(screen.queryByText("gift-1")).toBeNull();

  release();
  expect(await screen.findByText("gift-1")).toBeVisible();
  expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
});

test("창 포커스 같은 백그라운드 재조회는 행을 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
  const release = holdAfterFirstList(listBody());
  const { client } = renderCoupons();
  await screen.findByText("gift-1");

  const refetching = client.refetchQueries({ queryKey: couponKeys.list() });
  await waitFor(() => expect(callsTo("GET", "admin/coupons")).toHaveLength(2));

  expect(screen.getByText("gift-1")).toBeVisible();
  expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
  release();
  await refetching;
});

test("초기화를 누르면 스켈레톤을 거쳐 새로 받은 행이 보인다", async () => {
  const release = holdAfterFirstList(
    listBody({ items: [{ ...couponRow, slug: "fresh-1" }] }),
  );
  renderCoupons();
  await screen.findByText("gift-1");

  fireEvent.click(screen.getByRole("button", { name: "초기화" }));

  expect(await screen.findByRole("status", { name: LIST_LABEL })).toBeVisible();
  expect(screen.queryByText("gift-1")).toBeNull();
  release();
  expect(await screen.findByText("fresh-1")).toBeVisible();
});

test("쿠폰을 저장하면 옛 목록을 비우고 새로 받은 뒤 목록으로 돌아온다", async () => {
  const release = holdAfterFirstList(
    listBody({ items: [{ ...couponRow, slug: "new-slug" }] }),
  );
  on("POST", "admin/coupons", couponRow);
  const { client, router } = renderCoupons("/admin/coupons/new");
  await screen.findByText("쿠폰 키");
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
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(callsTo("GET", "admin/coupons")).toHaveLength(2));
  expect(client.getQueryData(couponKeys.list())).toBeUndefined();

  release();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/coupons"),
  );
  // 폼이 아직 떠 있는 동안에는 슬러그 중복 안내에도 같은 글자가 나오므로 목록 영역 안에서만 찾는다.
  const region = await screen.findByRole("region", { name: "쿠폰 목록" });
  expect(await within(region).findByText("new-slug")).toBeVisible();
});
