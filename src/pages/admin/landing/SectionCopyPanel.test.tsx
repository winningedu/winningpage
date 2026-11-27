import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
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

function renderPanel(
  sectionKey: "services" | "mentor" | "acceptance",
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SectionEditAccessProvider value={canEdit}>
        <SectionCopyPanel sectionKey={sectionKey} />
      </SectionEditAccessProvider>
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
  test("view 권한이면 저장 버튼을 감추고 edit 권한이면 보인다", async () => {
    const view = renderPanel("services", false);
    await waitFor(() =>
      expect(screen.getByLabelText("큰제목")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    view.unmount();
    renderPanel("services", true);
    expect(
      await screen.findByRole("button", { name: "저장" }),
    ).toBeInTheDocument();
  });

  test("view 권한이면 입력창이 읽기 전용이고 edit 권한이면 입력할 수 있다", async () => {
    const view = renderPanel("services", false);
    const labels = ["라벨", "큰제목", "중제목"];
    for (const label of labels) {
      expect(await screen.findByLabelText(label)).toHaveAttribute("readonly");
    }
    view.unmount();
    renderPanel("services", true);
    for (const label of labels) {
      expect(await screen.findByLabelText(label)).not.toHaveAttribute(
        "readonly",
      );
    }
  });

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

  test("받는 동안 입력창 대신 스켈레톤을 보이고 응답이 오면 채운 입력창으로 바뀐다", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.get.mockReturnValue(new Promise((r) => (finish = r)));
    renderPanel("services");
    expect(
      await screen.findByRole("status", {
        name: "섹션 제목을 불러오는 중입니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("큰제목")).toBeNull();
    // 라벨 입력이 있는 섹션은 3줄, 없는 섹션은 2줄이다.
    expect(
      screen.getAllByRole("status")[0]?.querySelectorAll('[data-part="row"]'),
    ).toHaveLength(3);
    finish({
      section_key: "services",
      eyebrow: "라벨",
      title_main: "기존 큰제목",
      title_sub: null,
    });
    expect(await screen.findByLabelText("큰제목")).toHaveValue("기존 큰제목");
    expect(
      screen.queryByRole("status", { name: "섹션 제목을 불러오는 중입니다." }),
    ).toBeNull();
  });

  test("라벨이 없는 섹션의 스켈레톤은 2줄이다", async () => {
    mocks.get.mockReturnValue(new Promise(() => {}));
    renderPanel("acceptance");
    const skeleton = await screen.findByRole("status", {
      name: "섹션 제목을 불러오는 중입니다.",
    });
    expect(skeleton.querySelectorAll('[data-part="row"]')).toHaveLength(2);
  });

  test("다시 받은 응답이 사용자가 이미 입력한 글을 덮어쓰지 않는다", async () => {
    mocks.get.mockResolvedValue({
      section_key: "acceptance",
      eyebrow: null,
      title_main: "처음 값",
      title_sub: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SectionCopyPanel sectionKey="acceptance" />
      </QueryClientProvider>,
    );
    const input = await screen.findByLabelText("큰제목");
    fireEvent.change(input, { target: { value: "내가 쓴 글" } });
    mocks.get.mockResolvedValue({
      section_key: "acceptance",
      eyebrow: null,
      title_main: "다른 값",
      title_sub: null,
    });
    await client.refetchQueries({
      queryKey: ["admin", "home-section-copy", "acceptance"],
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("큰제목")).toHaveValue("내가 쓴 글");
  });

  test("행이 아직 없으면(404) 입력창을 비워 둔다", async () => {
    renderPanel("mentor");
    expect(await screen.findByLabelText("큰제목")).toHaveValue("");
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
    await screen.findByLabelText("큰제목");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(mocks.put).not.toHaveBeenCalled();
    expect(screen.getByText("큰제목을 입력하세요.")).toBeInTheDocument();
  });
});
