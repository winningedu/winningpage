import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { CallItem } from "./api";
import CallsTab from "./CallsTab";
import { formatDate } from "./format";

const item: CallItem = {
  id: "c1",
  createdAt: "2026-10-07T01:00:00Z",
  startedAt: "2026-10-07T01:00:00Z",
  traceId: "t1",
  kind: "generate",
  service: "growth",
  feature: "report_step",
  step: "6",
  callKey: "section:2-1",
  targetKind: null,
  targetId: null,
  profileId: null,
  model: "gemini-2.5-flash",
  promptVersion: null,
  attempt: 2,
  retryReason: "truncated",
  transportAttempt: 1,
  status: "ok",
  errorCode: null,
  errorMessage: null,
  finishReason: "STOP",
  tokens: { prompt: 10, output: 5, cached: null, thoughts: null, total: 15 },
  inputChars: null,
  outputChars: null,
  latencyMs: 100,
  validation: "ok",
  issueCodes: [],
};

function renderTab(onPage = vi.fn(), page = 1, total = 45) {
  return render(
    <CallsTab
      data={{ items: [item], total, page, pageSize: 20 }}
      page={page}
      pageSize={20}
      onPage={onPage}
    />,
  );
}

describe("CallsTab", () => {
  test("첫 칸의 버튼으로 호출 상세를 열 수 있다", async () => {
    renderTab();
    fireEvent.click(
      screen.getByRole("button", { name: formatDate(item.createdAt) }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("section:2-1");
  });

  test("첫 칸의 버튼 클릭은 행으로 전파되지 않아 상세 열기가 한 번만 일어난다", async () => {
    const reachedBody = vi.fn();
    document.body.addEventListener("click", reachedBody);
    try {
      renderTab();
      fireEvent.click(
        screen.getByRole("button", { name: formatDate(item.createdAt) }),
      );
      expect(await screen.findByRole("dialog")).toBeTruthy();
      expect(reachedBody).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener("click", reachedBody);
    }
  });

  test("행을 눌러도 호출 상세가 열린다", async () => {
    renderTab();
    fireEvent.click(screen.getByText("section:2-1"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  test("모든 열 머리글이 scope col 을 갖는다", () => {
    renderTab();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBe(15);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });

  test("페이지 이동은 AdminPagination 으로 한다", () => {
    const onPage = vi.fn();
    renderTab(onPage);
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(onPage).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "1페이지" }).ariaCurrent).toBe(
      "page",
    );
  });

  test("마지막 페이지에서는 다음 페이지 버튼이 꺼진다", () => {
    renderTab(vi.fn(), 3);
    expect(
      (screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

function expectNumericColumn(table: HTMLElement, name: string) {
  const headers = within(table).getAllByRole("columnheader");
  const index = headers.findIndex((h) =>
    h.textContent?.trim().startsWith(name),
  );
  expect(index, name).toBeGreaterThanOrEqual(0);
  expect(headers[index]).toHaveClass("text-right");
  const cells = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[index]);
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    expect(cell).toHaveClass("text-right", "tabular-nums");
  }
}

test("호출 표의 숫자 열은 머리글과 셀 모두 오른쪽 정렬, 셀은 고정폭 숫자다", () => {
  renderTab();
  const table = screen.getByRole("table");
  for (const name of [
    "시도",
    "전송 시도",
    "prompt",
    "output",
    "cached",
    "지연 ms",
  ]) {
    expectNumericColumn(table, name);
  }
});
