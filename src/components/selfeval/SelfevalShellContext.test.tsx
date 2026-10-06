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

const { fetchEntryMock } = vi.hoisted(() => ({ fetchEntryMock: vi.fn() }));

vi.mock("@/lib/selfeval/api", () => ({
  fetchEntry: fetchEntryMock,
  fetchSessionDetail: vi.fn(),
  pickList: vi.fn(),
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
  SelfevalShellProvider,
  useSelfevalScreenStep,
  useSelfevalShell,
} from "./SelfevalShellContext";

const OPEN = {
  id: "s1",
  status: "draft",
  currentStep: 2,
  route: "analysis",
  area: "subject",
  subject: "수학",
  activityName: null,
  lastActivityAt: "2026-10-06T00:00:00Z",
};

function entryResponse(
  entry: Record<string, unknown> = {},
  sessions: unknown[] = [],
) {
  return {
    kind: "ok",
    data: {
      ok: true,
      entry: {
        quota: null,
        allowed: true,
        activityCount: 4,
        openSession: null,
        growth: null,
        profile: null,
        replyResent: 0,
        academicYearDefault: 2026,
        ...entry,
      },
      sessions,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <SelfevalShellProvider>{children}</SelfevalShellProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchEntryMock.mockReset();
});

describe("SelfevalShellProvider", () => {
  test("진입 정보를 받으면 열린 세션을 노출한다", async () => {
    fetchEntryMock.mockResolvedValue(entryResponse({ openSession: OPEN }));
    const { result } = renderHook(() => useSelfevalShell(), { wrapper });
    expect(result.current.openSession).toBeNull();
    await waitFor(() => expect(result.current.openSession?.id).toBe("s1"));
    expect(result.current.entry?.activityCount).toBe(4);
  });

  test("보관함이 읽을 세션 목록을 노출한다(받기 전에는 null)", async () => {
    fetchEntryMock.mockResolvedValue(entryResponse({}, [{ id: "s9" }]));
    const { result } = renderHook(() => useSelfevalShell(), { wrapper });
    expect(result.current.sessions).toBeNull();
    await waitFor(() =>
      expect(result.current.sessions).toEqual([{ id: "s9" }]),
    );
  });

  test("이름은 profiles 에서, 학년은 진입 정보 프로필에서 읽는다", async () => {
    fetchEntryMock.mockResolvedValue(
      entryResponse({
        profile: {
          gradeLabel: "고2",
          semester: 1,
          career: null,
          department: null,
          universities: [],
        },
      }),
    );
    const { result } = renderHook(() => useSelfevalShell(), { wrapper });
    expect(result.current.studentName).toBeNull();
    expect(result.current.gradeLabel).toBeNull();
    await waitFor(() => expect(result.current.studentName).toBe("QA학생"));
    await waitFor(() => expect(result.current.gradeLabel).toBe("고2"));
  });

  test("조회가 실패하면 값은 null 이고 오류가 노출된다", async () => {
    fetchEntryMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "내부 오류",
    });
    const { result } = renderHook(() => useSelfevalShell(), { wrapper });
    await waitFor(() => expect(result.current.entryError).not.toBeNull());
    expect(result.current.entry).toBeNull();
    expect(result.current.openSession).toBeNull();
  });

  test("refetchEntry 가 다시 조회한다", async () => {
    fetchEntryMock.mockResolvedValue(entryResponse());
    const { result } = renderHook(() => useSelfevalShell(), { wrapper });
    await waitFor(() => expect(result.current.entry).not.toBeNull());
    await act(async () => {
      await result.current.refetchEntry();
    });
    expect(fetchEntryMock).toHaveBeenCalledTimes(2);
  });

  test("프로바이더 밖에서 쓰면 던진다", () => {
    expect(() => renderHook(() => useSelfevalShell())).toThrow();
  });
});

describe("useSelfevalScreenStep", () => {
  function Screen() {
    useSelfevalScreenStep(3);
    return null;
  }
  function Probe() {
    const { currentStep } = useSelfevalShell();
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

  test("화면이 마운트되면 단계를 올리고 언마운트되면 비운다", () => {
    fetchEntryMock.mockResolvedValue({ kind: "timeout" });
    const client = new QueryClient();
    const tree = (showScreen: boolean) => (
      <QueryClientProvider client={client}>
        <SelfevalShellProvider>
          <Harness showScreen={showScreen} />
        </SelfevalShellProvider>
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
