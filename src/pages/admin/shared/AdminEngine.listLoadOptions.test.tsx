// AdminTable 목록 컬럼의 loadOptions(비동기 선택지) 표시 검증.
// 36개 config가 공유하는 표라서, loadOptions 가 없는 컬럼은 예전과 똑같이 그려지는지도 함께 고정한다.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  test("값이 비어 있으면 emptyLabel 을 보여 준다", async () => {
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      emptyLabel: "공통",
      loadOptions: () => Promise.resolve(OPTIONS),
    });
    await screen.findByText("스쿨멘토");
    const cells = cellsOf("노출 대상");
    expect(cells[1]).toBe("공통");
    expect(cells[3]).toBe("공통");
  });

  test("선택지에 없는 값은 지금처럼 저장된 값 그대로 보여 준다", async () => {
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      emptyLabel: "공통",
      loadOptions: () => Promise.resolve(OPTIONS),
    });
    await screen.findByText("스쿨멘토");
    expect(cellsOf("노출 대상")[2]).toBe("t-gone");
  });

  test("선택지 조회가 실패해도 목록은 그려지고 경고만 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      emptyLabel: "공통",
      loadOptions: () => Promise.reject(new Error("boom")),
    });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0][0]).toContain("tenant_id");
    expect(cellsOf("노출 대상")).toEqual(["t-1", "공통", "t-gone", "공통"]);
    expect(screen.getByText("첫째")).toBeTruthy();
  });

  test("emptyLabel 이 없으면 빈 값은 예전처럼 - 로 보인다", async () => {
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      loadOptions: () => Promise.resolve(OPTIONS),
    });
    await screen.findByText("스쿨멘토");
    expect(cellsOf("노출 대상")).toEqual(["스쿨멘토", "-", "t-gone", "-"]);
  });

  test("loadOptions 가 없는 컬럼은 예전과 똑같이 그려진다", () => {
    renderTable({ key: "tenant_id", label: "노출 대상", type: "select" });
    expect(cellsOf("노출 대상")).toEqual(["t-1", "-", "t-gone", "-"]);
  });

  test("loadOptions 가 없으면 column.options 로 예전처럼 라벨을 찾는다", () => {
    renderTable({
      key: "tenant_id",
      label: "노출 대상",
      type: "select",
      options: OPTIONS,
    });
    expect(cellsOf("노출 대상")).toEqual(["스쿨멘토", "-", "t-gone", "-"]);
  });
});
