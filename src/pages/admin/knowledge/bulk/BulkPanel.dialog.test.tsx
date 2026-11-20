// 미리보기 다이얼로그는 반영 중에 닫히지 않고, 바깥을 눌러서는 닫히지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("xlsx", () => ({ read: vi.fn(() => ({})) }));
vi.mock("./xlsxDownload", () => ({ downloadXlsx: vi.fn() }));
vi.mock("./xlsx", () => ({
  exportKnowledgeRowsToXlsx: vi.fn(),
  parseKnowledgeRowsFromXlsx: vi.fn(async () => ({
    inserts: [{ rowNo: 2, id: null, values: { title: "새 자료" } }],
    updates: [],
    errors: [],
  })),
}));
vi.mock("./bulkRun", () => ({
  // 검사는 바로 끝나고, 반영은 끝나지 않는 서버 호출로 둔다.
  runDedupe: vi.fn(async ({ dispatch }) => {
    dispatch({ type: "dedupeStarted", progress: "검사 중" });
    dispatch({
      type: "dedupeSucceeded",
      dedupe: new Map(),
      selected: new Set([2]),
    });
  }),
  runApply: vi.fn(({ dispatch }) => {
    dispatch({ type: "applyStarted", progress: "반영 중" });
    return new Promise(() => {});
  }),
}));

import BulkPanel from "./BulkPanel";

const config = {
  title: "위닝 수행 주제 DB",
  fields: [{ key: "title", label: "제목", type: "text" }],
  fixedValues: { knowledge_type: "topic_pattern" },
  defaults: {},
};

const TITLE = "위닝 수행 주제 DB 엑셀 올리기 미리보기";

async function openPreview() {
  render(<BulkPanel config={config} rows={[]} onReload={() => {}} />);
  const file = new File(["x"], "a.xlsx");
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(0),
  });
  fireEvent.change(screen.getByLabelText("위닝 수행 주제 DB xlsx 파일 선택"), {
    target: { files: [file] },
  });
  return screen.findByRole("dialog", { name: TITLE });
}

async function startApply() {
  await openPreview();
  fireEvent.click(screen.getByRole("button", { name: "중복 검사" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "반영" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "반영" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled(),
  );
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
}

function pressOutside() {
  const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
  expect(backdrop).not.toBeNull();
  fireEvent.pointerDown(backdrop as Element);
  fireEvent.mouseDown(backdrop as Element);
  fireEvent.click(backdrop as Element);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BulkPanel 미리보기 다이얼로그", () => {
  test("바깥을 눌러도 닫히지 않는다", async () => {
    await openPreview();

    pressOutside();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("반영 중에 바깥을 눌러도 닫히지 않는다", async () => {
    await startApply();

    pressOutside();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("반영 중에 Esc를 눌러도 닫히지 않는다", async () => {
    await startApply();

    pressEscape();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("반영 중이 아니면 Esc로 닫힌다", async () => {
    await openPreview();

    pressEscape();

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: TITLE }),
      ).not.toBeInTheDocument(),
    );
  });
});
