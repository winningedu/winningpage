// AdminMembersAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

import "@testing-library/jest-dom/vitest";
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
      {
        profile_id: "p2",
        status: "active",
        member_name: "이운영",
        member_email: "lee@example.com",
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

test("동작 없는 검색 버튼은 없다", async () => {
  render(<AdminMembersAdmin config={CONFIG} />);
  await screen.findByText("김관리");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 목록이 걸러진다", async () => {
  render(<AdminMembersAdmin config={CONFIG} />);
  await screen.findByText("김관리");

  fireEvent.change(screen.getByLabelText("관리자 검색"), {
    target: { value: "이운영" },
  });

  expect(screen.getByText("이운영")).toBeInTheDocument();
  expect(screen.queryByText("김관리")).not.toBeInTheDocument();
});
