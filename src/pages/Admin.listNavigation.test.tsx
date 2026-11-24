// 엔진 목록은 이번 이동이 시작된 뒤에 받은 응답으로만 행을 보인다. 선받기(미들웨어)와 마운트 요청은 한 번만 나간다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  responses: [] as ((value: unknown) => void)[],
  fetchSectionList: vi.fn(),
  deleteSectionRow: vi.fn(async () => {}),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  fetchSectionList: engine.fetchSectionList,
  fetchSectionRow: () => new Promise(() => {}),
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

import { AdminSectionRoute } from "./Admin";
import { startListNavigation } from "./admin/engine/listNavigation";
import { sectionListQueryOptions } from "./admin/engine/sectionList";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

const LABEL = "팝업 관리 목록을 불러오는 중입니다.";
const body = (title: string) => ({
  items: [{ id: 1, title, sort_order: 1 }],
  total: 1,
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const options = () => sectionListQueryOptions("popups", { page: 1, q: "" });

// 요청마다 약속을 하나씩 만들어 테스트가 응답 시점을 정한다.
function respond(index: number, title: string) {
  engine.responses[index]?.(body(title));
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPopups(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/popups"]}>
        <AdminSectionRoute section="popups" />
        <ConfirmAdminHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  engine.responses = [];
  engine.fetchSectionList.mockImplementation(
    () =>
      new Promise((resolve) => {
        engine.responses.push(resolve);
      }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Admin 엔진 목록과 선받기", () => {
  it("선받기가 마운트 전에 끝나면 요청 한 번으로 바로 행을 보인다", async () => {
    const client = newClient();
    startListNavigation(client, options());
    respond(0, "선받은 팝업");
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    renderPopups(client);

    expect(await screen.findByText("선받은 팝업")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: LABEL })).toBeNull();
    await sleep(20);
    expect(engine.fetchSectionList).toHaveBeenCalledTimes(1);
  });

  it("선받기가 마운트 때 진행 중이면 스켈레톤 뒤에 행을 보이고 요청은 한 번이다", async () => {
    const client = newClient();
    startListNavigation(client, options());
    renderPopups(client);

    expect(
      await screen.findByRole("status", { name: LABEL }),
    ).toBeInTheDocument();
    respond(0, "받은 팝업");
    expect(await screen.findByText("받은 팝업")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: LABEL })).toBeNull();
    expect(engine.fetchSectionList).toHaveBeenCalledTimes(1);
  });

  it("이전 이동에서 받은 캐시는 새 이동에서 스켈레톤 뒤 새 요청 한 번으로 바뀐다", async () => {
    const client = newClient();
    startListNavigation(client, options());
    const first = renderPopups(client);
    respond(0, "옛 팝업");
    await screen.findByText("옛 팝업");
    first.unmount();

    await sleep(10);
    startListNavigation(client, options());
    renderPopups(client);
    expect(
      await screen.findByRole("status", { name: LABEL }),
    ).toBeInTheDocument();
    expect(screen.queryByText("옛 팝업")).toBeNull();

    respond(1, "새 팝업");
    expect(await screen.findByText("새 팝업")).toBeInTheDocument();
    expect(engine.fetchSectionList).toHaveBeenCalledTimes(2);
  });

  it("직접 한 삭제 뒤에는 스켈레톤을 거쳐 새 행을 보인다", async () => {
    const client = newClient();
    startListNavigation(client, options());
    renderPopups(client);
    respond(0, "가을 팝업");
    await screen.findByText("가을 팝업");

    const trash = document.querySelector("button svg.lucide-trash-2");
    fireEvent.click(trash?.closest("button") as Element);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByRole("status", { name: LABEL }),
    ).toBeInTheDocument();
    expect(screen.queryByText("가을 팝업")).toBeNull();
    respond(1, "겨울 팝업");
    expect(await screen.findByText("겨울 팝업")).toBeInTheDocument();
  });
});
