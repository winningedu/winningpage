// AdminRolesAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

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

import { renderRoles, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/roles": {
      items: [
        {
          id: "r1",
          name: "운영팀",
          description: null,
          is_super: false,
          is_system: false,
          permissions: [],
        },
        {
          id: "r2",
          name: "재무팀",
          description: "정산 담당",
          is_super: false,
          is_system: false,
          permissions: [],
        },
      ],
      resources: [],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("목록은 GET admin/roles 로 그린다", async () => {
  renderRoles();

  expect(await screen.findByText("운영팀")).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith("admin/roles", expect.anything());
});

test("동작 없는 검색 버튼은 없다", async () => {
  renderRoles();
  await screen.findByText("운영팀");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 이름과 설명으로 목록이 걸러진다", async () => {
  renderRoles();
  await screen.findByText("운영팀");

  fireEvent.change(screen.getByLabelText("권한 묶음 검색"), {
    target: { value: "재무" },
  });

  expect(screen.getByText("재무팀")).toBeInTheDocument();
  expect(screen.queryByText("운영팀")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("권한 묶음 검색"), {
    target: { value: "정산" },
  });
  expect(screen.getByText("재무팀")).toBeInTheDocument();
});

test("주소의 q 로 시작하면 그 검색어로 걸러진 목록을 보인다", async () => {
  renderRoles("/admin/adminRoles?q=재무");

  expect(await screen.findByText("재무팀")).toBeInTheDocument();
  expect(screen.queryByText("운영팀")).not.toBeInTheDocument();
  expect(screen.getByLabelText("권한 묶음 검색")).toHaveValue("재무");
});

test("입력한 검색어는 주소의 q 에 써지고 비우면 지워진다", async () => {
  const { router } = renderRoles();
  await screen.findByText("운영팀");

  fireEvent.change(screen.getByLabelText("권한 묶음 검색"), {
    target: { value: "재무" },
  });
  expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
    "재무",
  );

  fireEvent.change(screen.getByLabelText("권한 묶음 검색"), {
    target: { value: "" },
  });
  expect(router.state.location.search).toBe("");
});
