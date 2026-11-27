// 프리미엄 책자 화면의 쓰기 권한. view 권한이면 등록, 삭제, PDF 적용, 저장을 감추고 edit 권한이면 보인다.

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      throw new Error("브라우저가 DB 를 직접 부르면 안 된다");
    },
    storage: {
      from: () => {
        throw new Error("브라우저가 스토리지를 직접 부르면 안 된다");
      },
    },
  },
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));
vi.mock("@/components/premiumBook/BookViewer", () => ({ default: () => null }));
vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { on, resetApi } from "./fakeApi";
import { PAGES_PATH, pageRow, renderPremiumBook } from "./testKit";

const LIST = "/admin/premiumBookPages";

beforeEach(() => {
  resetApi();
  on("GET", PAGES_PATH, { items: [pageRow(1, 1), pageRow(7, 2)] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
});

describe("목록", () => {
  test("view 권한이면 등록, 삭제, PDF 적용을 감추고 상세 보기만 남긴다", async () => {
    renderPremiumBook(LIST, undefined, false);
    expect(
      await screen.findAllByRole("button", { name: "상세 보기" }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /등록/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
    expect(screen.queryByText("PDF 일괄 변환 및 적용")).toBeNull();
  });

  test("edit 권한이면 등록, 삭제, PDF 적용을 보인다", async () => {
    renderPremiumBook(LIST, undefined, true);
    expect(await screen.findAllByRole("button", { name: "삭제" })).toHaveLength(
      2,
    );
    expect(screen.getByRole("button", { name: /등록/ })).toBeInTheDocument();
    expect(screen.getByText("PDF 일괄 변환 및 적용")).toBeInTheDocument();
  });
});

describe("폼", () => {
  test("view 권한이면 주소로 바로 열어도 저장 버튼이 없다", async () => {
    renderPremiumBook(`${LIST}/new`, undefined, false);
    await screen.findByRole("button", { name: /취소|목록/ });
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  });

  test("edit 권한이면 저장 버튼이 있다", async () => {
    renderPremiumBook(`${LIST}/new`, undefined, true);
    expect(
      await screen.findByRole("button", { name: "저장" }),
    ).toBeInTheDocument();
  });
});
