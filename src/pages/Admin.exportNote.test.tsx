import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));

// 어떤 체인이든 끝에서 await 하면 state.rows 를 돌려주는 가짜 supabase.
function listChain() {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) =>
            resolve({
              data: state.rows,
              count: state.rows.length,
              error: null,
            });
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => listChain(),
    rpc: () => listChain(),
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

vi.mock("./admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/shared/csvExport")>()),
  downloadCsvText: vi.fn(),
}));

// 실제 설정에는 서버 페이지네이션과 공용 내보내기를 함께 켠 비민감 섹션이 아직 없다.
// 입결정보에 공용 내보내기만 켜서 그 경로를 연다.
vi.mock("./admin/configs/admission", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./admin/configs/admission")>();
  return {
    ...actual,
    admissionConfigs: {
      ...actual.admissionConfigs,
      admissionResults: {
        ...actual.admissionConfigs.admissionResults,
        excel: true,
      },
    },
  };
});

import { Toaster, toast } from "@/components/ui/toast";
import { AdminSectionRoute } from "./Admin";
import { downloadCsvText } from "./admin/shared/csvExport";

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/admin/admissionResults"]}>
      <AdminSectionRoute section="admissionResults" />
      <Toaster />
    </MemoryRouter>,
  );
}

const NOTE =
  "3건을 내려받는 중입니다. 건수가 많으면 수십 초 걸릴 수 있으니 이 화면을 벗어나지 마세요.";

beforeEach(() => {
  state.rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Admin 서버 페이지네이션 내보내기 안내", () => {
  it("시작하면 닫을 때까지 남는 낮은 우선순위 안내를 보이고, 끝나면 닫는다", async () => {
    const addSpy = vi.spyOn(toast, "add");
    const closeSpy = vi.spyOn(toast, "close");
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "엑셀 다운로드" }),
    );

    await waitFor(() => expect(downloadCsvText).toHaveBeenCalledTimes(1));
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        priority: "low",
        timeout: 0,
        title: NOTE,
      }),
    );
    const id = addSpy.mock.results[0]?.value;
    expect(closeSpy).toHaveBeenCalledWith(id);
  });
});
