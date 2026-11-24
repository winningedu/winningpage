// 프리미엄 책자 페이지 목록. 목록, 중복 번호 경고, 쪽 번호 주소 보존, 이동, 삭제를 확인한다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { callsTo, on, resetApi } from "./fakeApi";
import { PAGES_PATH, pageRow, renderPremiumBook } from "./testKit";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => pageRow(i + 1, i + 1));

beforeEach(() => {
  resetApi();
  on("GET", PAGES_PATH, { items: rows(2) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
});

describe("목록", () => {
  test("서버가 준 페이지를 표로 그리고 요청에 signal 을 싣는다", async () => {
    renderPremiumBook();
    expect(await screen.findAllByRole("button", { name: "수정" })).toHaveLength(
      2,
    );
    const [call] = callsTo("GET", PAGES_PATH);
    expect(call?.options.signal).toBeInstanceOf(AbortSignal);
  });

  test("sort_order 가 겹치면 목록 위에 경고를 보인다", async () => {
    on("GET", PAGES_PATH, {
      items: [pageRow(1, 3), pageRow(2, 3), pageRow(3, 1)],
    });
    renderPremiumBook();
    expect(
      await screen.findByText(/페이지 번호\(sort_order\) 중복: 3/),
    ).toBeVisible();
  });

  test("주소의 page 로 열리고 쪽을 넘기면 주소가 바뀐다", async () => {
    on("GET", PAGES_PATH, { items: rows(12) });
    const { router } = renderPremiumBook("/admin/premiumBookPages?page=2");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(2),
    );
    fireEvent.click(screen.getByRole("button", { name: "1페이지" }));
    await waitFor(() =>
      expect(router.state.location.search).not.toContain("page=2"),
    );
  });

  test("목록 조회가 실패하면 토스트로 알리고 빈 표를 둔다", async () => {
    on("GET", PAGES_PATH, () => {
      throw new Error("boom");
    });
    renderPremiumBook();
    await waitFor(() =>
      expect(document.body.textContent).toContain("조회 실패"),
    );
    expect(screen.queryByRole("button", { name: "수정" })).toBeNull();
  });
});

describe("삭제", () => {
  test("취소하면 지우지 않는다", async () => {
    on("DELETE", `${PAGES_PATH}/1`, undefined);
    renderPremiumBook();
    const [del] = await screen.findAllByRole("button", { name: "삭제" });
    fireEvent.click(del as HTMLElement);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("정말 삭제하시겠습니까?");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(callsTo("DELETE", `${PAGES_PATH}/1`)).toHaveLength(0);
  });

  test("확인하면 DELETE 를 보내고 목록을 다시 받는다", async () => {
    on("DELETE", `${PAGES_PATH}/1`, undefined);
    renderPremiumBook();
    const [del] = await screen.findAllByRole("button", { name: "삭제" });
    fireEvent.click(del as HTMLElement);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );
    await waitFor(() =>
      expect(callsTo("DELETE", `${PAGES_PATH}/1`)).toHaveLength(1),
    );
    await waitFor(() => expect(callsTo("GET", PAGES_PATH)).toHaveLength(2));
  });

  test("삭제가 실패하면 오류 토스트를 보이고 목록은 그대로다", async () => {
    on("DELETE", `${PAGES_PATH}/1`, () => {
      throw new Error("boom");
    });
    renderPremiumBook();
    const [del] = await screen.findAllByRole("button", { name: "삭제" });
    fireEvent.click(del as HTMLElement);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );
    await waitFor(() =>
      expect(document.body.textContent).toContain("삭제 실패"),
    );
    expect(callsTo("GET", PAGES_PATH)).toHaveLength(1);
  });
});
