// AdminRolesAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

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
    admin_roles: [
      { id: "r1", name: "운영팀", is_super: false, is_system: false },
      { id: "r2", name: "재무팀", is_super: false, is_system: false },
    ],
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => query({ data: tables[table] ?? [], error: null }),
      }),
    },
  };
});

import AdminRolesAdmin from "./AdminRolesAdmin";

const CONFIG = { title: "권한 관리", searchPlaceholder: "검색" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("동작 없는 검색 버튼은 없다", async () => {
  render(<AdminRolesAdmin config={CONFIG} />);
  await screen.findByText("운영팀");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 목록이 걸러진다", async () => {
  render(<AdminRolesAdmin config={CONFIG} />);
  await screen.findByText("운영팀");

  fireEvent.change(screen.getByLabelText("권한 묶음 검색"), {
    target: { value: "재무" },
  });

  expect(screen.getByText("재무팀")).toBeInTheDocument();
  expect(screen.queryByText("운영팀")).not.toBeInTheDocument();
});
