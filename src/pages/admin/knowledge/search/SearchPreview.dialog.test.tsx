// 검색 테스트 다이얼로그는 검색 중에 닫히지 않고, 바깥을 눌러서는 닫히지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../api", () => ({ postSearchPreview: vi.fn() }));

import * as api from "../api";
import SearchPreview from "./SearchPreview";

const config = {
  title: "위닝 수행 주제 DB",
  fixedValues: { knowledge_type: "topic_pattern" },
};

const TITLE = "위닝 수행 주제 DB 검색 테스트";

async function openDialog() {
  render(<SearchPreview config={config} />);
  fireEvent.click(screen.getByRole("button", { name: "검색 테스트" }));
  return screen.findByRole("dialog", { name: TITLE });
}

async function startSearch() {
  vi.mocked(api.postSearchPreview).mockReturnValue(new Promise(() => {}));
  await openDialog();
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  await screen.findByRole("button", { name: "검색 중" });
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
  vi.resetAllMocks();
});

describe("SearchPreview 다이얼로그", () => {
  test("바깥을 눌러도 닫히지 않는다", async () => {
    await openDialog();

    pressOutside();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("검색 중에 바깥을 눌러도 닫히지 않는다", async () => {
    await startSearch();

    pressOutside();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("검색 중에 Esc를 눌러도 닫히지 않는다", async () => {
    await startSearch();

    pressEscape();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
  });

  test("검색 중이 아니면 Esc로 닫힌다", async () => {
    await openDialog();

    pressEscape();

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: TITLE }),
      ).not.toBeInTheDocument(),
    );
  });
});
