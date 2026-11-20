// MentorApplicationsAdmin 목록 도구줄. 검색 입력에 이름이 있고, 입력하면 목록이 걸러진다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const ROWS = [
  { id: "m1", name: "김지원", status: "접수" },
  { id: "m2", name: "박서준", status: "접수" },
];

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
    });
  return {
    supabase: {
      from: () => ({ select: () => query({ data: ROWS, error: null }) }),
    },
  };
});

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({ rows }: { rows: { id: string; name: string }[] }) => (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>{row.name}</li>
      ))}
    </ul>
  ),
}));

import MentorApplicationsAdmin from "./MentorApplicationsAdmin";

const CONFIG = {
  title: "신청 관리",
  searchPlaceholder: "이름 검색",
  columns: [],
};

afterEach(cleanup);

test("검색 입력은 이름이 있고 입력하면 목록이 걸러진다", async () => {
  render(<MentorApplicationsAdmin config={CONFIG} />);
  expect(await screen.findByText("박서준")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "신청 내역 검색" }), {
    target: { value: "김지원" },
  });

  expect(screen.getByText("김지원")).toBeInTheDocument();
  expect(screen.queryByText("박서준")).not.toBeInTheDocument();
});

test("아무 일도 하지 않는 검색 버튼은 없다", async () => {
  render(<MentorApplicationsAdmin config={CONFIG} />);
  await screen.findByText("박서준");

  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});
