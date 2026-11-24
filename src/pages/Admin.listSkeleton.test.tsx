// 엔진 목록과 수정 화면이 서버를 기다리는 동안의 스켈레톤. 처음, 쪽과 검색어 키 변경, 사용자가 직접 한 동작 뒤에만 보이고 배경 재조회에는 행이 남는다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  items: [] as { id: number; title: string; sort_order: number }[],
  hold: null as Promise<void> | null,
  fetchSectionList: vi.fn(),
  fetchSectionRow: vi.fn(),
  deleteSectionRow: vi.fn(async () => {}),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  fetchSectionList: engine.fetchSectionList,
  fetchSectionRow: engine.fetchSectionRow,
  deleteSectionRow: engine.deleteSectionRow,
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

import { mainConfigs } from "@/pages/admin/configs/main";
import { AdminSectionRoute } from "./Admin";
import { sectionKeys } from "./admin/engine/api";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

const LIST_LABEL = "팝업 관리 목록을 불러오는 중입니다.";
const row = (id: number, title: string) => ({ id, title, sort_order: id });

function holdResponses() {
  let release: () => void = () => {};
  engine.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

function renderPopups(entry = "/admin/popups") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <AdminSectionRoute section="popups" />
        <ConfirmAdminHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  engine.items = [row(7, "가을 팝업")];
  engine.hold = null;
  engine.fetchSectionList.mockImplementation(async () => {
    if (engine.hold) await engine.hold;
    return { items: engine.items, total: engine.items.length };
  });
  engine.fetchSectionRow.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Admin 엔진 목록 스켈레톤", () => {
  it("처음 받는 동안 번호와 관리 열을 더한 열 수의 표 스켈레톤을 보인다", async () => {
    holdResponses();
    renderPopups();

    const status = await screen.findByRole("status", { name: LIST_LABEL });
    expect(status.querySelector('[data-part="header"]')?.children).toHaveLength(
      mainConfigs.popups.columns.length + 2,
    );
  });

  it("응답이 오면 스켈레톤이 행으로 바뀐다", async () => {
    const release = holdResponses();
    renderPopups();
    await screen.findByRole("status", { name: LIST_LABEL });

    release();
    expect(await screen.findByText("가을 팝업")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
  });

  it("배경 재조회는 행을 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
    const { client } = renderPopups();
    await screen.findByText("가을 팝업");

    holdResponses();
    void client.refetchQueries({ queryKey: sectionKeys.section("popups") });
    await waitFor(() => expect(client.isFetching()).toBe(1));

    expect(screen.getByText("가을 팝업")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
  });

  it("초기화를 누르면 스켈레톤을 보인 뒤 새 행을 보인다", async () => {
    renderPopups();
    await screen.findByText("가을 팝업");

    const release = holdResponses();
    engine.items = [row(8, "겨울 팝업")];
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(
      await screen.findByRole("status", { name: LIST_LABEL }),
    ).toBeInTheDocument();
    expect(screen.queryByText("가을 팝업")).toBeNull();

    release();
    expect(await screen.findByText("겨울 팝업")).toBeInTheDocument();
  });

  it("행을 삭제하면 스켈레톤을 보인 뒤 새 목록을 보인다", async () => {
    renderPopups();
    await screen.findByText("가을 팝업");

    const release = holdResponses();
    engine.items = [row(8, "겨울 팝업")];
    const trash = document.querySelector("button svg.lucide-trash-2");
    fireEvent.click(trash?.closest("button") as Element);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByRole("status", { name: LIST_LABEL }),
    ).toBeInTheDocument();
    expect(screen.queryByText("가을 팝업")).toBeNull();

    release();
    expect(await screen.findByText("겨울 팝업")).toBeInTheDocument();
  });
});

describe("Admin 엔진 수정 화면 스켈레톤", () => {
  it("수정할 행을 받는 동안 필드 수만큼의 상세 스켈레톤을 보인다", async () => {
    renderPopups("/admin/popups/7");

    const status = await screen.findByRole("status", {
      name: "팝업 관리 상세를 불러오는 중입니다.",
    });
    expect(status.querySelectorAll('[data-part="row"]')).toHaveLength(
      mainConfigs.popups.fields.length,
    );
  });
});
