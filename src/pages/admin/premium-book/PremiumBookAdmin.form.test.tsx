// 프리미엄 책자 페이지 등록과 수정 화면. 주소로 열기, 저장, 취소, 없는 행, 이탈 확인, 업로드 연결을 확인한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const upload = vi.hoisted(() => ({
  issueUpload: vi.fn(),
  previewUpload: vi.fn(),
  removeUploads: vi.fn(),
  put: vi.fn(),
}));

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
vi.mock("@/pages/admin/engine/api", () => ({
  issueUpload: upload.issueUpload,
  previewUpload: upload.previewUpload,
  removeUploads: upload.removeUploads,
}));
vi.mock("@/lib/storage/signedUpload", () => ({ putSignedUpload: upload.put }));

import { toast } from "@/components/ui/toast";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { PAGES_PATH, pageRow, renderPremiumBook } from "./testKit";

const LIST = "/admin/premiumBookPages";

beforeEach(() => {
  resetApi();
  on("GET", PAGES_PATH, { items: [pageRow(1, 1), pageRow(7, 2)] });
  upload.issueUpload.mockImplementation(
    async (_s: string, f: { fileName: string }) => ({
      path: `tmp-${f.fileName}`,
      uploadUrl: `https://up/${f.fileName}?token=t`,
    }),
  );
  upload.previewUpload.mockImplementation(
    async (_s: string, path: string) => `https://read/${path}`,
  );
  upload.put.mockResolvedValue(undefined);
  upload.removeUploads.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("목록에서 이동", () => {
  test("등록은 new 주소로 간다", async () => {
    on("GET", PAGES_PATH, { items: [] });
    const { router } = renderPremiumBook();
    fireEvent.click(await screen.findByRole("button", { name: /등록/ }));
    expect(router.state.location.pathname).toBe(`${LIST}/new`);
  });

  test("수정은 그 행 id 주소로 가고 목록 쪽 번호를 들고 간다", async () => {
    const { router } = renderPremiumBook(`${LIST}?page=1`);
    const [edit] = await screen.findAllByRole("button", { name: "수정" });
    fireEvent.click(edit as HTMLElement);
    expect(router.state.location.pathname).toBe(`${LIST}/1`);
    expect(router.state.location.state).toEqual({ from: "?page=1" });
  });

  test("브라우저 뒤로가기는 같은 쪽의 목록으로 돌아온다", async () => {
    const { router } = renderPremiumBook(`${LIST}?page=1`);
    const [edit] = await screen.findAllByRole("button", { name: "수정" });
    on("GET", `${PAGES_PATH}/1`, pageRow(1, 1));
    fireEvent.click(edit as HTMLElement);
    await screen.findByDisplayValue("1");
    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
    expect(router.state.location.search).toBe("?page=1");
    expect(await screen.findAllByRole("button", { name: "수정" })).toHaveLength(
      2,
    );
  });
});

describe("등록", () => {
  test("저장하면 POST 하고 목록으로 돌아온다", async () => {
    on("POST", PAGES_PATH, pageRow(9, 5));
    const { router } = renderPremiumBook(`${LIST}/new`);
    const order = await screen.findByDisplayValue("1");
    fireEvent.change(order, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
    expect(callsTo("POST", PAGES_PATH)[0]?.options.json).toEqual({
      sort_order: 5,
      image_url: "",
    });
  });

  test("저장이 실패하면 오류 토스트를 보이고 폼에 머문다", async () => {
    on("POST", PAGES_PATH, () => {
      throw new FakeApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        detail: "요청 값이 올바르지 않아요.",
      });
    });
    const { router } = renderPremiumBook(`${LIST}/new`);
    fireEvent.change(await screen.findByDisplayValue("1"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(document.body.textContent).toContain("등록 실패"),
    );
    expect(router.state.location.pathname).toBe(`${LIST}/new`);
  });

  test("이미지를 올리면 서버 임시 업로드를 거쳐 읽기 주소가 값이 된다", async () => {
    on("POST", PAGES_PATH, pageRow(9, 1));
    const { container, router } = renderPremiumBook(`${LIST}/new`);
    await screen.findByDisplayValue("1");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "p01.webp", { type: "image/webp" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(upload.issueUpload).toHaveBeenCalledWith("premiumBookPages", {
        field: "image_url",
        fileName: "p01.webp",
        contentType: "image/webp",
        size: 1,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("https://read/tmp-p01.webp"),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
    expect(callsTo("POST", PAGES_PATH)[0]?.options.json).toEqual({
      sort_order: 1,
      image_url: "https://read/tmp-p01.webp",
    });
  });
});

describe("수정", () => {
  test("새로고침처럼 주소로 바로 열어도 그 행을 받아 채운다", async () => {
    on("GET", `${PAGES_PATH}/7`, pageRow(7, 2));
    renderPremiumBook(`${LIST}/7`);
    expect(await screen.findByDisplayValue("2")).toBeVisible();
    expect(callsTo("GET", `${PAGES_PATH}/7`)).toHaveLength(1);
  });

  test("저장하면 PATCH 하고, 들고 온 쪽 번호의 목록으로 돌아온다", async () => {
    on("GET", `${PAGES_PATH}/7`, pageRow(7, 2));
    on("PATCH", `${PAGES_PATH}/7`, pageRow(7, 3));
    const { router } = renderPremiumBook({
      pathname: `${LIST}/7`,
      state: { from: "?page=2" },
    });
    const order = await screen.findByDisplayValue("2");
    fireEvent.change(order, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
    expect(router.state.location.search).toBe("?page=2");
    expect(callsTo("PATCH", `${PAGES_PATH}/7`)[0]?.options.json).toEqual({
      sort_order: 3,
      image_url: pageRow(7, 2).image_url,
    });
  });

  test("없는 행은 빈 폼 대신 찾을 수 없음 안내와 목록으로 버튼을 보인다", async () => {
    on("GET", `${PAGES_PATH}/9`, () => {
      throw new FakeApiError({ status: 404, code: "NOT_FOUND" });
    });
    const { router } = renderPremiumBook(`${LIST}/9`);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "페이지를 찾을 수 없어요.",
    );
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(router.state.location.pathname).toBe(LIST);
  });

  test("양의 정수가 아닌 id 는 서버를 부르지 않고 찾을 수 없음으로 본다", async () => {
    renderPremiumBook(`${LIST}/abc`);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "페이지를 찾을 수 없어요.",
    );
    expect(callsTo("GET", `${PAGES_PATH}/abc`)).toHaveLength(0);
  });

  test("조회가 그 밖의 이유로 실패하면 원문 없이 불러오지 못했음을 알린다", async () => {
    on("GET", `${PAGES_PATH}/7`, () => {
      throw new FakeApiError({
        status: 500,
        code: "INTERNAL_ERROR",
        detail: "secret db detail",
      });
    });
    renderPremiumBook(`${LIST}/7`);
    expect(
      await screen.findByText("페이지를 불러오지 못했어요."),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("secret db detail");
  });

  test("알 수 없는 하위 주소는 목록으로 보낸다", async () => {
    const { router } = renderPremiumBook(`${LIST}/7/extra`);
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
  });
});

describe("이탈 확인", () => {
  async function openDirtyEdit() {
    on("GET", `${PAGES_PATH}/7`, pageRow(7, 2));
    const view = renderPremiumBook(`${LIST}/7`);
    fireEvent.change(await screen.findByDisplayValue("2"), {
      target: { value: "4" },
    });
    return view;
  }

  test("고친 폼에서 취소하면 확인을 묻고, 머물기를 고르면 폼이 남는다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { router } = await openDirtyEdit();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe(`${LIST}/7`);
    expect(screen.getByDisplayValue("4")).toBeVisible();
  });

  test("나가기를 고르면 목록으로 간다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { router } = await openDirtyEdit();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
  });

  test("고치지 않은 폼의 취소는 묻지 않는다", async () => {
    const confirm = vi.spyOn(window, "confirm");
    on("GET", `${PAGES_PATH}/7`, pageRow(7, 2));
    const { router } = renderPremiumBook(`${LIST}/7`);
    await screen.findByDisplayValue("2");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST));
    expect(confirm).not.toHaveBeenCalled();
  });

  test("폼은 자체 히스토리 항목을 쌓지 않는다", async () => {
    const push = vi.spyOn(window.history, "pushState");
    on("GET", `${PAGES_PATH}/7`, pageRow(7, 2));
    renderPremiumBook(`${LIST}/7`);
    await screen.findByDisplayValue("2");
    expect(push).not.toHaveBeenCalled();
  });
});
