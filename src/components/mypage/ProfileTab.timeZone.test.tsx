import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(async (_payload: unknown, _options?: unknown) => ({
    error: null as { code: string } | null,
  })),
  stored: { time_zone: "Asia/Seoul" },
}));

// 어떤 쿼리 체인이든 빈 결과를 돌려주고, profiles 읽기만 저장된 시간대를 돌려준다.
vi.mock("@/lib/supabase", () => {
  const chain = (table: string) => {
    const result = { data: [], error: null };
    const node: Record<string, unknown> = {
      maybeSingle: async () => ({
        data: table === "profiles" ? { ...mocks.stored } : null,
        error: null,
      }),
      upsert: mocks.upsert,
      // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더처럼 await 할 수 있게 한다
      then: (resolve: (value: unknown) => unknown) => resolve(result),
    };
    const proxy: unknown = new Proxy(node, {
      get: (target, key) =>
        key in target ? target[key as string] : () => proxy,
    });
    return proxy;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: async () => ({ data: [], error: null }),
      auth: {
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    },
  };
});

import ProfileTab from "./ProfileTab";

const enrollment = {} as never;

function renderTab() {
  return render(
    <MemoryRouter>
      <ProfileTab
        user={{ id: "u1", email: "a@example.com" } as never}
        profile={{ id: "u1", name: "김학부모" }}
        isParent
        enrollment={enrollment}
      />
    </MemoryRouter>,
  );
}

describe("ProfileTab 시간대", () => {
  beforeEach(() => {
    mocks.upsert.mockClear();
    mocks.stored.time_zone = "America/New_York";
  });
  afterEach(cleanup);

  it("저장된 시간대가 미리 선택돼 있다", async () => {
    renderTab();

    const select = await screen.findByRole("combobox", { name: "시간대" });
    await vi.waitFor(() => expect(select).toHaveValue("America/New_York"));
  });

  it("시간대를 고르고 저장하면 profiles.time_zone 으로 저장한다", async () => {
    renderTab();

    const select = await screen.findByRole("combobox", { name: "시간대" });
    fireEvent.change(select, { target: { value: "Europe/Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "시간대 저장" }));

    await vi.waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: "u1", time_zone: "Europe/Paris" }),
        { onConflict: "id" },
      ),
    );
  });

  it("DB 가 거부하면(23514) 오류 문구를 보인다", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: "23514" } });
    renderTab();

    const select = await screen.findByRole("combobox", { name: "시간대" });
    fireEvent.change(select, { target: { value: "Europe/Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "시간대 저장" }));

    expect(await screen.findByText(/저장에 실패했습니다/)).toBeInTheDocument();
  });
});
