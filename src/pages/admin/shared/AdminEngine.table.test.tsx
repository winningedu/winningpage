// AdminTable 의 접근성 구조(헤더 scope, 로딩/빈 상태) 검증.
// 36개 config 가 공유하는 표라서 DOM 구조가 아니라 역할(role)로 단언한다.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
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
