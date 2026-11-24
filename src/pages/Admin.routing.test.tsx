// 엔진 섹션의 등록(new)과 수정(:id) 주소. 새로고침과 404, 저장과 취소 뒤 복귀를 확인한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  fetchSectionList: vi.fn(),
  fetchSectionRow: vi.fn(),
  createSectionRow: vi.fn(),
  updateSectionRow: vi.fn(),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  ...engine,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderSectionRoutes } from "./admin/engine/testRouter";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

const POPUP = { id: 7, title: "가을 팝업", sort_order: 1, is_active: true };
const extras = (
  <>
    <Toaster />
    <ConfirmAdminHost />
  </>
);

function render(entry: string) {
  return renderSectionRoutes("popups", entry, { extras });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  engine.fetchSectionList.mockResolvedValue({ items: [POPUP], total: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("목록에서 등록으로", () => {
  it("[등록] 은 /new 로 가고 저장하면 목록으로 돌아온다", async () => {
    engine.createSectionRow.mockResolvedValue({ id: 8, title: "신규" });
    const { router } = render("/admin/popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(router.state.location.pathname).toBe("/admin/popups/new");
    fireEvent.change(
      (await screen.findAllByRole("textbox"))[0] as HTMLElement,
      { target: { value: "신규" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(engine.createSectionRow).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/popups"),
    );
    expect(await screen.findByText("가을 팝업")).toBeInTheDocument();
  });

  it("취소하면 목록으로 돌아온다", async () => {
    const { router } = render("/admin/popups/new");

    fireEvent.click(await screen.findByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/popups"),
    );
  });
});

describe("수정 주소", () => {
  it("새로고침한 /:id 는 id 로 행을 받아 채우고, 저장하면 그 id 로 PATCH 한 뒤 목록으로 돌아온다", async () => {
    engine.fetchSectionRow.mockResolvedValue(POPUP);
    engine.updateSectionRow.mockResolvedValue(POPUP);
    const { router } = render("/admin/popups/7");

    fireEvent.change(await screen.findByDisplayValue("가을 팝업"), {
      target: { value: "겨울 팝업" },
    });
    expect(engine.fetchSectionRow).toHaveBeenCalledWith(
      "popups",
      "7",
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(engine.updateSectionRow).toHaveBeenCalledTimes(1),
    );
    const [key, id, values] = engine.updateSectionRow.mock.calls[0] ?? [];
    expect([key, id]).toEqual(["popups", 7]);
    expect(values).toMatchObject({ title: "겨울 팝업" });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/popups"),
    );
  });

  it("목록의 [수정] 은 /:id 로 간다", async () => {
    engine.fetchSectionRow.mockResolvedValue(POPUP);
    const { router } = render("/admin/popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));

    expect(router.state.location.pathname).toBe("/admin/popups/7");
    expect(await screen.findByDisplayValue("가을 팝업")).toBeInTheDocument();
  });

  it("없는 id(404)는 안내를 띄우고 목록으로 돌아간다", async () => {
    engine.fetchSectionRow.mockRejectedValue(
      new ApiError({ status: 404, code: "NOT_FOUND", detail: "없음" }),
    );
    const { router } = render("/admin/popups/999");

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/popups"),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("찾을 수 없는 항목입니다."),
    );
  });
});
