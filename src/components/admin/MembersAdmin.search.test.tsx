// MembersAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const PROFILES = [
  {
    id: "p-kim",
    name: "김학생",
    member_type: "student",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p-lee",
    name: "이학생",
    member_type: "student",
    created_at: "2026-01-02T00:00:00Z",
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
      chain({ data: table === "profiles" ? PROFILES : [], error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({ rows }: { rows: { id: string; name: string }[] }) => (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>{row.name}</li>
      ))}
    </ul>
  ),
}));

import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("동작 없는 검색 버튼은 없다", async () => {
  render(<MembersAdmin config={CONFIG} />);
  await screen.findByText("김학생");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 목록이 걸러진다", async () => {
  render(<MembersAdmin config={CONFIG} />);
  await screen.findByText("김학생");

  fireEvent.change(screen.getByLabelText("회원 검색"), {
    target: { value: "이학생" },
  });

  expect(screen.getByText("이학생")).toBeInTheDocument();
  expect(screen.queryByText("김학생")).not.toBeInTheDocument();
});
