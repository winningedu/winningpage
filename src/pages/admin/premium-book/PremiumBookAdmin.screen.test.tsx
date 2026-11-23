// 프리미엄 책자 화면의 접근성. PDF 선택 입력, 변환 오류 안내, 불러오는 중 안내를 검증한다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error("깨진 PDF")) }),
}));

vi.mock("@/components/premiumBook/BookViewer", () => ({
  default: () => null,
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminForm: () => null,
  AdminTable: () => null,
  collectBannerPaths: () => [],
  removeBannerPaths: async () => {},
  uploadImage: async () => {},
}));

vi.mock("@/lib/supabase", () => {
  const table = () => ({
    select: () => {
      const result = { data: [], error: null };
      return Object.assign(Promise.resolve(result), {
        order: () => Promise.resolve(result),
      });
    },
  });
  return { supabase: { from: () => table() } };
});

import PremiumBookAdmin from "./PremiumBookAdmin";

afterEach(cleanup);

function pdfInput() {
  return screen.getByLabelText("PDF 선택") as HTMLInputElement;
}

test("PDF 선택 입력은 숨기지 않고 시각만 감춰 키보드로 열 수 있다", () => {
  render(<PremiumBookAdmin config={{ title: "책자" }} />);

  const input = pdfInput();
  expect(input).toHaveClass("sr-only");
  expect(input).not.toHaveClass("hidden");
  expect(input.closest("label")?.className).toContain(
    "has-[:focus-visible]:ring-3",
  );
});

test("PDF를 고른 뒤 같은 파일을 다시 고를 수 있게 입력값을 비운다", () => {
  render(<PremiumBookAdmin config={{ title: "책자" }} />);

  const input = pdfInput();
  const sets: string[] = [];
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => "",
    set: (v: string) => sets.push(v),
  });
  const file = new File(["x"], "book.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });

  expect(screen.getByText("book.pdf")).toBeInTheDocument();
  expect(sets).toContain("");
});

test("변환이 실패하면 오류가 role=alert 로 보인다", async () => {
  render(<PremiumBookAdmin config={{ title: "책자" }} />);

  const file = new File(["x"], "book.pdf", { type: "application/pdf" });
  fireEvent.change(pdfInput(), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "PDF 변환" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("깨진 PDF"),
  );
});
