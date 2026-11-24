// 프리미엄 책자 화면의 접근성. PDF 선택 입력, 변환 오류 안내, 불러오는 중 안내를 검증한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error("깨진 PDF")) }),
}));
vi.mock("@/components/premiumBook/BookViewer", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { on, resetApi } from "./fakeApi";
import { PAGES_PATH, renderPremiumBook } from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", PAGES_PATH, { items: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pdfInput = () => screen.getByLabelText("PDF 선택") as HTMLInputElement;

test("PDF 선택 입력은 숨기지 않고 시각만 감춰 키보드로 열 수 있다", async () => {
  renderPremiumBook();
  const input = await screen.findByLabelText("PDF 선택");
  expect(input).toHaveClass("sr-only");
  expect(input).not.toHaveClass("hidden");
  expect(input.closest("label")?.className).toContain(
    "has-[:focus-visible]:ring-3",
  );
});

test("목록을 불러오는 동안 상태 안내를 보인다", async () => {
  on("GET", PAGES_PATH, () => new Promise(() => {}));
  renderPremiumBook();
  expect(
    await screen.findByRole("status", {
      name: "프리미엄 책자 목록을 불러오는 중입니다.",
    }),
  ).toBeInTheDocument();
});

test("캐시에 있는 목록으로 다시 들어오면 옛 행 대신 스켈레톤을 보인다", async () => {
  const first = renderPremiumBook();
  await screen.findByLabelText("PDF 선택");
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  );
  first.unmount();

  on("GET", PAGES_PATH, () => new Promise(() => {}));
  renderPremiumBook("/admin/premiumBookPages", first.client);
  expect(
    await screen.findByRole("status", {
      name: "프리미엄 책자 목록을 불러오는 중입니다.",
    }),
  ).toBeInTheDocument();
});

test("PDF를 고른 뒤 같은 파일을 다시 고를 수 있게 입력값을 비운다", async () => {
  renderPremiumBook();
  await screen.findByLabelText("PDF 선택");

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
  renderPremiumBook();
  await screen.findByLabelText("PDF 선택");

  const file = new File(["x"], "book.pdf", { type: "application/pdf" });
  fireEvent.change(pdfInput(), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "PDF 변환" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("깨진 PDF"),
  );
});
