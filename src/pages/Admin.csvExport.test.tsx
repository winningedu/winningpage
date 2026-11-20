import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const gateApi = vi.hoisted(() => ({
  order: [] as string[],
}));

vi.mock("@/lib/adminAccessLog", () => ({
  verifyAdminPassword: vi.fn(async () => ({ ok: true })),
  writeAdminAccessLog: vi.fn(async () => {
    gateApi.order.push("log");
    return { ok: true };
  }),
}));

vi.mock("./admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/shared/csvExport")>()),
  downloadCsv: vi.fn(() => {
    gateApi.order.push("download");
  }),
}));

import { Toaster, toast } from "@/components/ui/toast";
import { writeAdminAccessLog } from "@/lib/adminAccessLog";
import { AdminSectionRoute } from "./Admin";
import { downloadCsv } from "./admin/shared/csvExport";

function consult(id: number, name = `신청자${id}`) {
  return {
    id,
    created_at: "2026-11-01T00:00:00Z",
    name,
    phone: "010-0000-0000",
    email: `a${id}@example.com`,
    service: "상담",
    message: "문의",
    status: "접수",
  };
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/admin/premiumConsults"]}>
      <AdminSectionRoute section="premiumConsults" />
      <Toaster />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  gateApi.order = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function toastTitles() {
  return Array.from(document.querySelectorAll('[data-slot="toast-title"]')).map(
    (node) => node.textContent,
  );
}

describe("Admin CSV 다운로드 게이트", () => {
  it("행이 0건이면 게이트를 열지 않고 토스트로 알린다", async () => {
    state.rows = [];
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: /엑셀 다운로드/ }),
    );

    await waitFor(() =>
      expect(toastTitles()).toContain("내보낼 데이터가 없습니다."),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("N건이면 게이트 설명에 건수와 소요 시간 안내가 보인다", async () => {
    state.rows = [consult(1), consult(2), consult(3)];
    renderSection();
    await screen.findByText("신청자1");

    fireEvent.click(screen.getByRole("button", { name: /엑셀 다운로드/ }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "3건의 개인정보가 CSV 파일로 저장됩니다. 건수가 많으면 수십 초 걸릴 수 있습니다.",
    );
  });

  it("승인 뒤에는 확인창 없이 로그를 남기고 다운로드한다", async () => {
    state.rows = [consult(1)];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSection();
    await screen.findByText("신청자1");

    fireEvent.click(screen.getByRole("button", { name: /엑셀 다운로드/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/관리자 비밀번호/), {
      target: { value: "pw" },
    });
    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: "정산 확인" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "확인" }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    expect(gateApi.order).toEqual(["log", "download"]);
    expect(writeAdminAccessLog).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
