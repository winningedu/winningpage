import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { postSessionMock } = vi.hoisted(() => ({ postSessionMock: vi.fn() }));

vi.mock("@/lib/inquiry/api", () => ({
  postSession: postSessionMock,
  fetchReports: vi.fn(),
  fetchSessionDetail: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "QA학생" }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));

import {
  InquiryShellProvider,
  useInquiryScreenStep,
  useInquiryShell,
} from "./InquiryShellContext";

const QUOTA = {
  quotaTotal: 10,
  quotaUsed: 3,
  quotaRemaining: 7,
  planEndsAt: null,
  planLabel: null,
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    session: null,
    profile: null,
    quota: QUOTA,
    handoff: null,
    records: [],
    subjectCounts: [],
    assets: [],
    topics: [],
    gradeNote: null,
    replyResent: false,
    ...overrides,
  };
}

const SESSION = {
  id: "s1",
  status: "draft",
  currentStep: 1,
  gradeLabel: "고2",
  semester: 2,
  career: "수의예과",
  subject: "생명과학",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <InquiryShellProvider>{children}</InquiryShellProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => postSessionMock.mockReset());

describe("InquiryShellProvider", () => {
  test("부트스트랩 전에는 값이 비어 있고 로딩이다", () => {
    postSessionMock.mockResolvedValue({ kind: "timeout" });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    expect(result.current.bootstrap).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.quota).toBeNull();
    expect(result.current.isBootstrapLoading).toBe(true);
  });

  test("resume 응답의 세션, 잔여 회차, 자산을 노출한다", async () => {
    postSessionMock.mockResolvedValue({
      kind: "ok",
      data: response({ session: SESSION, assets: [{ id: "a1" }] }),
    });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.session?.id).toBe("s1"));
    expect(postSessionMock).toHaveBeenCalledWith({ action: "resume" });
    expect(result.current.quota).toEqual(QUOTA);
    expect(result.current.assets).toHaveLength(1);
    expect(result.current.isBootstrapLoading).toBe(false);
  });

  test("학년은 세션을 우선하고 없으면 프로필에서 읽는다", async () => {
    postSessionMock.mockResolvedValue({
      kind: "ok",
      data: response({
        profile: { gradeLabel: "고3", semester: 1, career: "교사" },
      }),
    });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.gradeLabel).toBe("고3"));
  });

  test("이름은 profiles 에서 읽는다", async () => {
    postSessionMock.mockResolvedValue({ kind: "ok", data: response() });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.studentName).toBe("QA학생"));
  });

  test("부트스트랩 실패는 bootstrapError 로 노출되고 값은 비어 있다", async () => {
    postSessionMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "내부 오류",
    });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapError).not.toBeNull());
    expect(result.current.session).toBeNull();
    expect(result.current.assets).toEqual([]);
  });

  test("applyBootstrap 이 캐시를 즉시 갱신한다", async () => {
    postSessionMock.mockResolvedValue({ kind: "ok", data: response() });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.bootstrap).not.toBeNull());
    act(() => {
      result.current.applyBootstrap({ session: SESSION as never });
    });
    await waitFor(() => expect(result.current.session?.id).toBe("s1"));
    expect(postSessionMock).toHaveBeenCalledTimes(1);
  });

  test("refetchBootstrap 이 다시 조회한다", async () => {
    postSessionMock.mockResolvedValue({ kind: "ok", data: response() });
    const { result } = renderHook(() => useInquiryShell(), { wrapper });
    await waitFor(() => expect(result.current.bootstrap).not.toBeNull());
    await act(async () => {
      await result.current.refetchBootstrap();
    });
    expect(postSessionMock).toHaveBeenCalledTimes(2);
  });

  test("프로바이더 밖에서 쓰면 던진다", () => {
    expect(() => renderHook(() => useInquiryShell())).toThrow();
  });
});

describe("useInquiryScreenStep", () => {
  function Screen() {
    useInquiryScreenStep(3);
    return null;
  }
  function Probe() {
    const { currentStep } = useInquiryShell();
    return <output data-testid="step">{String(currentStep)}</output>;
  }
  function Harness({ showScreen }: { showScreen: boolean }) {
    return (
      <>
        {showScreen && <Screen />}
        <Probe />
      </>
    );
  }

  test("마운트되면 단계를 올리고 언마운트되면 비운다", () => {
    postSessionMock.mockResolvedValue({ kind: "timeout" });
    const client = new QueryClient();
    const tree = (showScreen: boolean) => (
      <QueryClientProvider client={client}>
        <InquiryShellProvider>
          <Harness showScreen={showScreen} />
        </InquiryShellProvider>
      </QueryClientProvider>
    );
    const view = render(tree(false));
    expect(screen.getByTestId("step").textContent).toBe("null");
    view.rerender(tree(true));
    expect(screen.getByTestId("step").textContent).toBe("3");
    view.rerender(tree(false));
    expect(screen.getByTestId("step").textContent).toBe("null");
  });
});
