// PDF 변환: pdfjs 모듈을 불러오는 동안에도 선택한 파일을 읽기 시작한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
});

// 모듈 팩토리가 끝나야 동적 import 가 끝난다. gate 를 풀기 전까지 pdfjs 불러오기는 진행 중이다.
vi.mock("pdfjs-dist", async () => {
  await hoisted.gate;
  return {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 1024, height: 1400 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    }),
  };
});
vi.mock("@/components/premiumBook/BookViewer", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);
vi.mock("@/lib/storage/signedUpload", () => ({ putSignedUpload: vi.fn() }));

import { on, resetApi } from "./fakeApi";
import { PAGES_PATH, renderPremiumBook } from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", PAGES_PATH, { items: [] });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(["x"], { type: "image/webp" }));
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("pdfjs 를 불러오는 중에도 PDF 파일 읽기를 시작한다", async () => {
  const { container } = renderPremiumBook();
  await screen.findByLabelText("PDF 선택");
  const input = container.querySelector('input[type="file"]') as HTMLElement;
  const file = new File(["%PDF"], "book.pdf", { type: "application/pdf" });
  const arrayBuffer = vi.fn(async () => new ArrayBuffer(4));
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  fireEvent.change(input, { target: { files: [file] } });

  fireEvent.click(screen.getByRole("button", { name: "PDF 변환" }));

  await waitFor(() => expect(arrayBuffer).toHaveBeenCalledTimes(1));
  hoisted.release();
  expect(await screen.findByRole("button", { name: /^적용 \(/ })).toBeVisible();
});
