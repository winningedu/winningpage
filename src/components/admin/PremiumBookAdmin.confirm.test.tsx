import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  deleted: [] as unknown[],
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock("@/components/premiumBook/BookViewer", () => ({
  default: () => null,
}));

// 표는 삭제 콜백만 확인하면 되므로 버튼 하나로 대신한다.
vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminForm: () => null,
  AdminTable: ({ onDelete }: { onDelete: (row: { id: number }) => void }) => (
    <button type="button" onClick={() => onDelete({ id: 5 })}>
      행 삭제
    </button>
  ),
  collectBannerPaths: () => [],
  removeBannerPaths: async () => {},
  uploadImage: async () => {},
}));

vi.mock("@/lib/supabase", () => {
  const table = () => ({
    select: () => {
      const result = { data: [], error: null };
      return Object.assign(Promise.resolve(result), {
        order: () => Promise.resolve(result),
      });
    },
    delete: () => ({
      eq: async (_column: string, id: unknown) => {
        hoisted.deleted.push(id);
        return { error: null };
      },
    }),
  });
  return { supabase: { from: () => table() } };
});

import { Toaster, toast } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import PremiumBookAdmin from "./PremiumBookAdmin";

function renderAdmin() {
  render(
    <>
      <PremiumBookAdmin config={{ title: "책자" }} />
      <Toaster />
      <ConfirmAdminHost />
    </>,
  );
}

beforeEach(() => {
  hoisted.deleted.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

describe("PremiumBookAdmin 행 삭제 확인", () => {
  test("취소하면 삭제하지 않는다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "행 삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("정말 삭제하시겠습니까?");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(hoisted.deleted).toEqual([]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("삭제를 확인하면 그 행을 지운다", async () => {
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "행 삭제" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );

    await waitFor(() => expect(hoisted.deleted).toEqual([5]));
  });
});
