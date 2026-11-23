// MembersAdmin 라벨 없는 컨트롤의 접근 가능한 이름: 회원구분 필터, 소속 선택, 메시지 입력란.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const PROFILES = [
  {
    id: "p-student",
    name: "김학생",
    member_type: "student",
    tenant_id: "t-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];
const TENANTS = [
  { id: "t-1", name: "가나고", org_type: "학교", is_catch_all: false },
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
    from: (table: string) => {
      if (table === "profiles") return chain({ data: PROFILES, error: null });
      if (table === "tenants") return chain({ data: TENANTS, error: null });
      return chain({ data: [], error: null });
    },
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

import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("회원구분 필터 select는 이름을 가진다", async () => {
  render(<MembersAdmin config={CONFIG} />);
  await screen.findByRole("button", { name: "열기 김학생" });

  expect(screen.getByRole("combobox", { name: "회원구분" })).toBeVisible();
});

test("상세의 소속 select는 이름을 가진다", async () => {
  render(<MembersAdmin config={CONFIG} />);
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));

  expect(await screen.findByRole("combobox", { name: "소속" })).toBeVisible();
});

test("메시지 입력란은 이름을 가진다", async () => {
  render(<MembersAdmin config={CONFIG} />);
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
  fireEvent.click(await screen.findByRole("tab", { name: /알림톡.문자/ }));

  expect(
    await screen.findByRole("textbox", { name: "메시지 내용" }),
  ).toBeVisible();
});
