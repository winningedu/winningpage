// AdminTable 의 접근성 구조(헤더 scope, 로딩/빈 상태) 검증.
// 36개 config 가 공유하는 표라서 DOM 구조가 아니라 역할(role)로 단언한다.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminTable } from "./AdminEngine";

type Row = { id: string; title: string };

function renderTable(rows: Row[] = [{ id: "r1", title: "첫째" }]) {
  const config = {
    title: "테스트",
    table: "t",
    order: "id",
    columns: [{ key: "title", label: "이름" }],
    fields: [],
  };
  return render(
    <AdminTable
      config={config as never}
      rows={rows}
      page={1}
      setPage={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  );
}

afterEach(cleanup);

describe("AdminTable 헤더", () => {
  test("모든 열 머리글이 scope=col 을 가진다", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["번호", "이름", "관리"]);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });
});

const CONFIG = {
  title: "테스트",
  table: "t",
  order: "id",
  columns: [{ key: "title", label: "이름" }],
  fields: [],
};

function makeRows(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${offset + i + 1}`,
    title: `행${offset + i + 1}`,
  }));
}

describe("AdminTable 페이지 이동", () => {
  test("클라이언트 페이징: 현재 페이지를 표시하고 다음 버튼이 다음 페이지를 요청한다", () => {
    const setPage = vi.fn();
    render(
      <AdminTable
        config={CONFIG as never}
        rows={makeRows(25)}
        page={1}
        setPage={setPage}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(
      screen
        .getByRole("button", { name: "1페이지" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      (screen.getByRole("button", { name: "이전 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(setPage).toHaveBeenCalledTimes(1);
    const arg = setPage.mock.calls[0]?.[0];
    expect(typeof arg === "function" ? arg(1) : arg).toBe(2);
  });

  test("서버 페이징: 받은 행을 자르지 않고 totalCount 로 건수와 번호를 계산한다", () => {
    const setPage = vi.fn();
    render(
      <AdminTable
        config={{ ...CONFIG, serverPaginate: true } as never}
        rows={makeRows(10, 40)}
        page={5}
        setPage={setPage}
        totalCount={43000}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("43,000")).toBeTruthy();
    expect(screen.getByText("42960")).toBeTruthy();
    expect(screen.getByText("5 / 4,300 페이지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "마지막 페이지" }));
    const arg = setPage.mock.calls[0]?.[0];
    expect(typeof arg === "function" ? arg(5) : arg).toBe(4300);
  });
});
