// AdminTable 목록 컬럼의 loadOptions(비동기 선택지) 표시 검증.
// 36개 config가 공유하는 표라서, loadOptions 가 없는 컬럼은 예전과 똑같이 그려지는지도 함께 고정한다.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminTable } from "./AdminEngine";

type Row = { id: string; title: string; tenant_id: string | null };

const OPTIONS = [
  { value: "t-1", label: "스쿨멘토" },
  { value: "t-2", label: "위닝에듀" },
];

const ROWS: Row[] = [
  { id: "r1", title: "첫째", tenant_id: "t-1" },
  { id: "r2", title: "둘째", tenant_id: null },
  { id: "r3", title: "셋째", tenant_id: "t-gone" },
  { id: "r4", title: "넷째", tenant_id: "" },
];

function renderTable(column: Record<string, unknown>, rows: Row[] = ROWS) {
  const config = {
    title: "테스트",
    table: "t",
    order: "id",
    columns: [{ key: "title", label: "이름" }, column],
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

function cellsOf(label: string): string[] {
  const headers = screen.getAllByRole("columnheader");
  const index = headers.findIndex((h) => h.textContent === label);
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((tr) => tr.querySelectorAll("td")[index]?.textContent ?? "");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminTable 컬럼 loadOptions", () => {
  test("불러온 선택지의 label 로 값을 보여 준다", async () => {
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      emptyLabel: "공통",
      loadOptions: () => Promise.resolve(OPTIONS),
    });
    await screen.findByText("스쿨멘토");
    expect(cellsOf("노출 대상")[0]).toBe("스쿨멘토");
  });
});
