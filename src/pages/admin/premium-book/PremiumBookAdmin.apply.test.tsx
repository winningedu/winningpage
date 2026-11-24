// PDF 변환 뒤 [적용]. 파일은 임시 업로드로 올리고 서버 apply 가 한 번에 반영한다.
// 파일이 모두 올라가기 전에는 apply 를 부르지 않고(2단계 보장), 오류는 코드별 문구로만 보인다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  pageCount: 3,
  put: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      get numPages() {
        return hoisted.pageCount;
      },
      getPage: async () => ({
        getViewport: () => ({ width: 1024, height: 1400 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));
vi.mock("@/components/premiumBook/BookViewer", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);
vi.mock("@/lib/storage/signedUpload", () => ({ putSignedUpload: hoisted.put }));

import { calls, callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { PAGES_PATH, pageRow, renderPremiumBook } from "./testKit";

const APPLY = "admin/premium-book/apply";

async function convert() {
  const { container } = renderPremiumBook();
  await screen.findByLabelText("PDF 선택");
  const input = container.querySelector('input[type="file"]') as HTMLElement;
  const file = new File(["%PDF"], "book.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
  });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "PDF 변환" }));
  return screen.findByRole("button", { name: /^적용 \(/ });
}

const issued = () =>
  callsTo("POST", "admin/uploads").map((c) => c.options.json);

beforeEach(() => {
  resetApi();
  hoisted.pageCount = 3;
  hoisted.put.mockReset();
  hoisted.put.mockResolvedValue(undefined);
  let n = 0;
  on("POST", "admin/uploads", (options: { json?: unknown }) => {
    const { field, fileName } = options.json as {
      field: string;
      fileName: string;
    };
    n += 1;
    return {
      path: `00000000-0000-4000-8000-00000000000${n}.${field}.${fileName}`,
      uploadUrl: `https://up.test/${fileName}?token=t${n}`,
    };
  });
  on("POST", APPLY, { items: [pageRow(1, 1), pageRow(2, 2), pageRow(3, 3)] });
  on("GET", PAGES_PATH, { items: [] });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(["x"], { type: "image/webp" }));
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("적용", () => {
  test("PDF 와 페이지를 임시 업로드로 올린 뒤 apply 를 한 번 부르고 완료를 알린다", async () => {
    fireEvent.click(await convert());

    expect(await screen.findByText("적용 완료, 3장 반영됨")).toBeVisible();

    expect(issued()).toEqual([
      expect.objectContaining({
        section: "premiumBookPages",
        field: "booklet_pdf",
        fileName: "booklet.pdf",
        contentType: "application/pdf",
        size: 4,
      }),
      expect.objectContaining({
        section: "premiumBookPages",
        field: "page_webp",
        fileName: "p01.webp",
        contentType: "image/webp",
        size: 1,
      }),
      expect.objectContaining({ field: "page_webp", fileName: "p02.webp" }),
      expect.objectContaining({ field: "page_webp", fileName: "p03.webp" }),
    ]);
    expect(hoisted.put.mock.calls.map(([url]) => url)).toEqual([
      "https://up.test/booklet.pdf?token=t1",
      "https://up.test/p01.webp?token=t2",
      "https://up.test/p02.webp?token=t3",
      "https://up.test/p03.webp?token=t4",
    ]);
    const applyCalls = callsTo("POST", APPLY);
    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0]?.options.json).toEqual({
      pdf: "00000000-0000-4000-8000-000000000001.booklet_pdf.booklet.pdf",
      pages: [
        "00000000-0000-4000-8000-000000000002.page_webp.p01.webp",
        "00000000-0000-4000-8000-000000000003.page_webp.p02.webp",
        "00000000-0000-4000-8000-000000000004.page_webp.p03.webp",
      ],
    });
  });

  test("apply 는 모든 파일을 올린 뒤에만 부른다", async () => {
    let applyAt = -1;
    hoisted.put.mockImplementation(async () => {
      expect(callsTo("POST", APPLY)).toHaveLength(0);
    });
    on("POST", APPLY, () => {
      applyAt = calls.length;
      return { items: [] };
    });
    fireEvent.click(await convert());
    await screen.findByText(/적용 완료/);
    expect(hoisted.put).toHaveBeenCalledTimes(4);
    expect(applyAt).toBeGreaterThan(0);
  });

  test("끝나면 책자 목록을 다시 받는다", async () => {
    fireEvent.click(await convert());
    await screen.findByText(/적용 완료/);
    await vi.waitFor(() => expect(callsTo("GET", PAGES_PATH)).toHaveLength(2));
  });
});

describe("진행 문구", () => {
  test("원본, 페이지(i/N), 데이터베이스 순서로 보인다", async () => {
    const seen: string[] = [];
    const status = () =>
      screen.queryByText(/업로드 중|데이터베이스 반영 중/)?.textContent ?? "";
    // 화면이 그려질 틈을 준 뒤에 문구를 읽는다.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    hoisted.put.mockImplementation(async () => {
      await tick();
      seen.push(status());
    });
    on("POST", APPLY, async () => {
      await tick();
      seen.push(status());
      return { items: [] };
    });
    fireEvent.click(await convert());
    await screen.findByText(/적용 완료/);

    expect(seen).toEqual([
      "원본 PDF 업로드 중...",
      "페이지 이미지 업로드 중 (1/3)...",
      "페이지 이미지 업로드 중 (2/3)...",
      "페이지 이미지 업로드 중 (3/3)...",
      "데이터베이스 반영 중...",
    ]);
  });

  test("적용하는 동안 적용 버튼은 비활성이다", async () => {
    let release: () => void = () => {};
    on(
      "POST",
      APPLY,
      () =>
        new Promise((resolve) => {
          release = () => resolve({ items: [] });
        }),
    );
    fireEvent.click(await convert());
    expect(
      await screen.findByRole("button", { name: "적용 중..." }),
    ).toBeDisabled();
    release();
    await screen.findByText(/적용 완료/);
  });
});

describe("실패", () => {
  test("원본 PDF 를 못 올리면 페이지와 apply 를 부르지 않는다", async () => {
    hoisted.put.mockRejectedValueOnce(
      new FakeApiError({ status: 500, code: "HTTP_500", detail: "secret" }),
    );
    fireEvent.click(await convert());
    expect(await screen.findByText(/원본 PDF 업로드 실패/)).toBeVisible();
    expect(issued()).toHaveLength(1);
    expect(callsTo("POST", APPLY)).toHaveLength(0);
    expect(document.body.textContent).not.toContain("secret");
  });

  test("2번째 페이지에서 실패하면 번호를 알리고 apply 를 부르지 않는다", async () => {
    hoisted.put
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new FakeApiError({ status: 500, code: "HTTP_500", detail: "secret" }),
      );
    fireEvent.click(await convert());
    const message = await screen.findByText(/2번째 페이지 이미지 업로드 실패/);
    expect(message).toHaveTextContent("DB는 변경되지 않았습니다");
    expect(callsTo("POST", APPLY)).toHaveLength(0);
    expect(document.body.textContent).not.toContain("secret");
  });

  test("UPLOAD_EXPIRED 는 파일을 다시 올리라는 문구로 보인다", async () => {
    on("POST", APPLY, () => {
      throw new FakeApiError({
        status: 409,
        code: "UPLOAD_EXPIRED",
        detail: "server text",
      });
    });
    fireEvent.click(await convert());
    expect(
      await screen.findByText(
        "올린 파일이 만료됐어요. 파일을 다시 올려 주세요.",
      ),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("server text");
  });

  test("DUPLICATE_SORT_ORDER 는 중복 행을 먼저 정리하라는 문구로 보인다", async () => {
    on("POST", APPLY, () => {
      throw new FakeApiError({
        status: 409,
        code: "DUPLICATE_SORT_ORDER",
        detail: "server text",
      });
    });
    fireEvent.click(await convert());
    const message = await screen.findByText(/sort_order\) 중복/);
    expect(message).toHaveTextContent("DB는 변경되지 않았습니다");
    expect(message).toHaveTextContent("중복 행을 먼저 정리하세요");
    expect(document.body.textContent).not.toContain("server text");
  });

  test("그 밖의 apply 오류는 일반 문구이고 서버 원문을 싣지 않는다", async () => {
    on("POST", APPLY, () => {
      throw new FakeApiError({
        status: 500,
        code: "INTERNAL_ERROR",
        detail: "secret db detail",
      });
    });
    fireEvent.click(await convert());
    const message = await screen.findByText(/적용 중 오류가 발생했습니다/);
    expect(message).toHaveTextContent("다시 적용하면 복구됩니다");
    expect(document.body.textContent).not.toContain("secret db detail");
    expect(screen.queryByText(/적용 완료/)).toBeNull();
  });
});
