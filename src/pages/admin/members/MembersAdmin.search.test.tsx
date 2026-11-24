// MembersAdmin 검색. 입력하는 대로 목록이 걸러지고, 동작 없는 검색 버튼은 두지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
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

import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/members": {
      items: [
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
      ],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("동작 없는 검색 버튼은 없다", async () => {
  renderMembers();
  await screen.findByText("김학생");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("입력하는 대로 목록이 걸러진다", async () => {
  renderMembers();
  await screen.findByText("김학생");

  fireEvent.change(screen.getByLabelText("회원 검색"), {
    target: { value: "이학생" },
  });

  expect(screen.getByText("이학생")).toBeInTheDocument();
  expect(screen.queryByText("김학생")).not.toBeInTheDocument();
});
