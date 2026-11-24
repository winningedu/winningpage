// AdminMembersAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/staff": {
      items: [
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
      roles: [{ id: "role-1", name: "운영자", is_super: false }],
      resources: [],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("목록은 GET admin/staff 로 그린다", async () => {
  renderMembers();

  expect(await screen.findByText("김관리")).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith("admin/staff", expect.anything());
});

test("동작 없는 검색 버튼은 없다", async () => {
  renderMembers();
  await screen.findByText("김관리");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 목록이 걸러진다", async () => {
  renderMembers();
  await screen.findByText("김관리");

  fireEvent.change(screen.getByLabelText("관리자 검색"), {
    target: { value: "이운영" },
  });

  expect(screen.getByText("이운영")).toBeInTheDocument();
  expect(screen.queryByText("김관리")).not.toBeInTheDocument();
});

test("주소의 q 로 시작하면 그 검색어로 걸러진 목록을 보인다", async () => {
  renderMembers("/admin/adminMembers?q=이운영");

  expect(await screen.findByText("이운영")).toBeInTheDocument();
  expect(screen.queryByText("김관리")).not.toBeInTheDocument();
  expect(screen.getByLabelText("관리자 검색")).toHaveValue("이운영");
});

test("입력한 검색어는 주소의 q 에 써지고 비우면 지워진다", async () => {
  const { router } = renderMembers();
  await screen.findByText("김관리");

  fireEvent.change(screen.getByLabelText("관리자 검색"), {
    target: { value: "이운영" },
  });
  expect(router.state.location.search).toBe("?q=%EC%9D%B4%EC%9A%B4%EC%98%81");

  fireEvent.change(screen.getByLabelText("관리자 검색"), {
    target: { value: "" },
  });
  expect(router.state.location.search).toBe("");
});
