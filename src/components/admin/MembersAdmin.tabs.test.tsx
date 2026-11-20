// MembersAdmin 상세의 탭 전환과 부분 실패 안내.
// 탭은 role="tab"이고, 상세를 다시 열면 첫 탭으로 돌아오며, 일부 조회가 실패하면
// DB 원문 없이 안내만 role="alert"로 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const state = vi.hoisted(() => ({
  ordersError: null as { message: string; code?: string } | null,
}));

const PROFILES = [
  {
    id: "p-student",
    name: "김학생",
    member_type: "student",
    created_at: "2026-01-01T00:00:00Z",
  },
];

function chain(result: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) =>
      chain({
        data: table === "profiles" ? PROFILES : [],
        error: table === "orders" ? state.ordersError : null,
      }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
  }) => (
    <div>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { Toaster, toast } from "@/components/ui/toast";
import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  state.ordersError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

async function openDetail() {
  render(
    <>
      <MembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
}

test("상세의 탭은 role=tab이고 선택한 탭의 내용만 보인다", async () => {
  await openDetail();

  const profile = await screen.findByRole("tab", { name: "고객 상세 정보" });
  const pay = screen.getByRole("tab", { name: "결제내역" });
  expect(profile).toHaveAttribute("aria-selected", "true");
  expect(pay).toHaveAttribute("aria-selected", "false");
  expect(await screen.findByText("기본 정보")).toBeInTheDocument();

  fireEvent.click(pay);

  expect(pay).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByText("결제 내역이 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText("기본 정보")).not.toBeInTheDocument();
});

test("결제내역 표의 머리글은 scope=col이다", async () => {
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));

  const header = await screen.findByRole("columnheader", { name: "주문번호" });
  expect(header).toHaveAttribute("scope", "col");
});

test("상세를 닫았다가 다시 열면 첫 탭으로 돌아온다", async () => {
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));

  expect(
    await screen.findByRole("tab", { name: "고객 상세 정보" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("일부 조회가 실패하면 원문 없이 안내만 role=alert로 보인다", async () => {
  state.ordersError = {
    message: "permission denied for 홍길동",
    code: "42501",
  };
  await openDetail();

  const notice = await screen.findByText(/아래 항목이 비어 있을 수 있습니다/);
  expect(notice).toHaveAttribute("role", "alert");
  expect(document.body.textContent).not.toContain("홍길동");
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("코드: 42501"),
  );
});
