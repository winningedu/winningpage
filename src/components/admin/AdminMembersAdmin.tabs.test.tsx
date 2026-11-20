// AdminMembersAdmin 상세의 탭 전환. 탭은 role="tab"으로 노출되고, 상세를 다시 열면 첫 탭으로 돌아온다.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  const tables: Record<string, unknown[]> = {
    admin_member_directory: [
      {
        profile_id: "p1",
        status: "active",
        member_name: "김관리",
        member_email: "kim@example.com",
      },
    ],
    admin_roles: [{ id: "role-1", name: "운영자", is_super: false }],
    admin_resources: [],
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => query({ data: tables[table] ?? [], error: null }),
      }),
      rpc: () => query({ data: [], error: null }),
    },
  };
});

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

import AdminMembersAdmin from "./AdminMembersAdmin";

const CONFIG = { title: "관리자 계정", searchPlaceholder: "검색" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openDetail() {
  render(<AdminMembersAdmin config={CONFIG} />);
  fireEvent.click(await screen.findByRole("button", { name: "더보기" }));
}

test("상세의 탭은 role=tab이고 선택한 탭의 내용만 보인다", async () => {
  await openDetail();

  const info = await screen.findByRole("tab", { name: "직원 정보" });
  const perm = screen.getByRole("tab", { name: "개별 권한 설정" });
  expect(info).toHaveAttribute("aria-selected", "true");
  expect(perm).toHaveAttribute("aria-selected", "false");
  expect(screen.getByText("kim@example.com")).toBeInTheDocument();

  fireEvent.click(perm);

  expect(perm).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText(/개별 권한은 권한 묶음을 덮어씁니다/)).toBeVisible();
  expect(screen.queryByText("kim@example.com")).not.toBeInTheDocument();
});

test("상세를 닫았다가 다시 열면 첫 탭으로 돌아온다", async () => {
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "개별 권한 설정" }));

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  fireEvent.click(await screen.findByRole("button", { name: "더보기" }));

  expect(await screen.findByRole("tab", { name: "직원 정보" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
