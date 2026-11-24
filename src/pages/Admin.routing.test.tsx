// 엔진 섹션의 등록(new)과 수정(:id) 주소. 새로고침과 404, 저장과 취소 뒤 복귀를 확인한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

import { Link } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderSectionRoutes } from "./admin/engine/testRouter";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

const POPUP = { id: 7, title: "가을 팝업", sort_order: 1, is_active: true };
const extras = (
  <>
    <Toaster />
    <ConfirmAdminHost />
    <Link to="/elsewhere">다른 화면으로</Link>
  </>
);

function render(entry: string | { pathname: string; state?: unknown }) {
  return renderSectionRoutes("popups", entry, {
    extras,
    extraRoutes: [{ path: "/elsewhere", element: <p>다른 화면</p> }],
  });
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

describe("등록 프리필", () => {
  it("/new 는 router state 의 프리필로 채우고, 새로고침해도 다시 쓰지 않도록 state 를 지운다", async () => {
    const { router } = render({
      pathname: "/admin/popups/new",
      state: { prefillCreateDefaults: { title: "프리필 제목" } },
    });

    expect(await screen.findByDisplayValue("프리필 제목")).toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.state).not.toHaveProperty(
        "prefillCreateDefaults",
      ),
    );
    expect(router.state.location.pathname).toBe("/admin/popups/new");
  });

  it("state 없이 연 /new(새로고침)는 프리필 없이 백지다", async () => {
    render("/admin/popups/new");

    await screen.findByRole("button", { name: "저장" });
    expect(screen.queryByDisplayValue("프리필 제목")).not.toBeInTheDocument();
  });
});

describe("저장하지 않은 변경 보호", () => {
  async function openDirtyEdit() {
    engine.fetchSectionRow.mockResolvedValue(POPUP);
    const view = render("/admin/popups/7");
    fireEvent.change(await screen.findByDisplayValue("가을 팝업"), {
      target: { value: "겨울 팝업" },
    });
    return view;
  }

  it("고친 폼에서 다른 화면으로 가는 링크를 누르면 확인창이 뜨고, 계속 수정하면 그대로 머문다", async () => {
    const { router } = await openDirtyEdit();

    fireEvent.click(screen.getByRole("link", { name: "다른 화면으로" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있어요");
    fireEvent.click(within(dialog).getByRole("button", { name: "계속 수정" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/admin/popups/7");
  });

  it("나가기를 고르면 이동한다", async () => {
    const { router } = await openDirtyEdit();

    fireEvent.click(screen.getByRole("link", { name: "다른 화면으로" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "나가기",
      }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/elsewhere"),
    );
  });

  it("고치지 않은 폼은 막지 않는다", async () => {
    engine.fetchSectionRow.mockResolvedValue(POPUP);
    const { router } = render("/admin/popups/7");
    await screen.findByDisplayValue("가을 팝업");

    fireEvent.click(screen.getByRole("link", { name: "다른 화면으로" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/elsewhere"),
    );
  });

  it("고친 폼은 새로고침과 탭 닫기에서 브라우저 확인창을 요청한다", async () => {
    await openDirtyEdit();
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it("고치지 않았으면 브라우저 확인창을 요청하지 않는다", async () => {
    engine.fetchSectionRow.mockResolvedValue(POPUP);
    render("/admin/popups/7");
    await screen.findByDisplayValue("가을 팝업");
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });
});
