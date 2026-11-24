import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  deleteSectionRow: vi.fn(async () => {}),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  fetchSectionList: vi.fn(async () => ({
    items: [{ id: 7, title: "가을 팝업", sort_order: 1 }],
    total: 1,
  })),
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

import { toast } from "@/components/ui/toast";
import { AdminSectionRoute } from "./Admin";
import { TestQueryProvider } from "./admin/engine/testQuery";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

async function clickRowDelete() {
  await screen.findByText("가을 팝업");
  const trash = document.querySelector("button svg.lucide-trash-2");
  fireEvent.click(trash?.closest("button") as Element);
}

function renderPopups() {
  return render(
    <TestQueryProvider>
      <MemoryRouter initialEntries={["/admin/popups"]}>
        <AdminSectionRoute section="popups" />
        <ConfirmAdminHost />
      </MemoryRouter>
    </TestQueryProvider>,
  );
}

describe("Admin 행 삭제 확인", () => {
  it("취소하면 삭제하지 않는다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPopups();

    await clickRowDelete();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "정말 삭제하시겠습니까?",
    );
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(engine.deleteSectionRow).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("삭제를 누르면 행을 지운다", async () => {
    renderPopups();

    await clickRowDelete();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() =>
      expect(engine.deleteSectionRow).toHaveBeenCalledWith("popups", 7),
    );
  });
});
