import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import SectionCopyPanel from "./SectionCopyPanel";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: {
    get: (...args: unknown[]) => ({ json: () => mocks.get(...args) }),
    put: (...args: unknown[]) => ({ json: () => mocks.put(...args) }),
  },
}));

function apiError(status: number, detail: string) {
  return new ApiError({ status, code: "X", detail });
}

function renderPanel(sectionKey: "services" | "mentor" | "acceptance") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SectionCopyPanel sectionKey={sectionKey} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.get.mockRejectedValue(apiError(404, "없음"));
  mocks.put.mockResolvedValue({});
});

describe("SectionCopyPanel", () => {
  test("저장된 값을 입력창에 채우고 섹션 경로와 signal 로 읽는다", async () => {
    mocks.get.mockResolvedValue({
      section_key: "services",
      eyebrow: "라벨",
      title_main: "기존 큰제목",
      title_sub: "기존 중제목",
    });
    renderPanel("services");
    await waitFor(() =>
      expect(screen.getByLabelText("큰제목")).toHaveValue("기존 큰제목"),
    );
    expect(screen.getByLabelText("중제목")).toHaveValue("기존 중제목");
    expect(screen.getByLabelText("라벨")).toHaveValue("라벨");
    expect(mocks.get).toHaveBeenCalledWith("admin/home-section-copy/services", {
      signal: expect.any(AbortSignal),
    });
  });

  test("행이 아직 없으면(404) 입력창을 비워 둔다", async () => {
    renderPanel("mentor");
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.getByLabelText("큰제목")).toHaveValue("");
    expect(screen.queryByText(/저장하지 못했습니다/)).not.toBeInTheDocument();
  });

  test("입력 후 저장하면 섹션 경로로 PUT 하고 성공 메시지를 보인다", async () => {
    renderPanel("acceptance");
    fireEvent.change(await screen.findByLabelText("큰제목"), {
      target: { value: "새 큰제목" },
    });
    fireEvent.change(screen.getByLabelText("중제목"), {
      target: { value: "새 중제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith(
      "admin/home-section-copy/acceptance",
      {
        json: {
          eyebrow: null,
          title_main: "새 큰제목",
          title_sub: "새 중제목",
        },
      },
    );
    expect(await screen.findByText("저장했습니다.")).toBeInTheDocument();
  });

  test("저장 실패 시 서버 detail 을 붙인 실패 메시지를 보인다", async () => {
    mocks.put.mockRejectedValue(apiError(403, "이 메뉴를 쓸 권한이 없습니다."));
    renderPanel("mentor");
    fireEvent.change(await screen.findByLabelText("큰제목"), {
      target: { value: "제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(
      await screen.findByText(
        "저장하지 못했습니다. 이 메뉴를 쓸 권한이 없습니다.",
      ),
    ).toBeInTheDocument();
  });

  test("저장하는 동안 버튼이 비활성이다", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.put.mockReturnValue(new Promise((r) => (finish = r)));
    renderPanel("mentor");
    fireEvent.change(await screen.findByLabelText("큰제목"), {
      target: { value: "제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "저장" })).toBeDisabled(),
    );
    finish({});
    await screen.findByText("저장했습니다.");
  });

  test("큰제목이 비어 있으면 저장하지 않는다", async () => {
    renderPanel("mentor");
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(mocks.put).not.toHaveBeenCalled();
    expect(screen.getByText("큰제목을 입력하세요.")).toBeInTheDocument();
  });
});
