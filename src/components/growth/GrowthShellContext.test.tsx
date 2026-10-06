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

const { fetchSurveyBootstrapMock } = vi.hoisted(() => ({
  fetchSurveyBootstrapMock: vi.fn(),
}));

vi.mock("@/lib/growth/api", () => ({
  fetchSurveyBootstrap: fetchSurveyBootstrapMock,
  fetchReports: vi.fn(),
  fetchPlan: vi.fn(),
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
  GrowthShellProvider,
  useGrowthScreenStep,
  useGrowthShell,
} from "./GrowthShellContext";

const OPEN = {
  id: "r1",
  status: "draft",
  currentStep: 0,
  track: null,
  answered: 3,
  total: 24,
  answers: {},
  lastActivityAt: "2026-10-06T00:00:00Z",
  startedAt: "2026-10-06T00:00:00Z",
  resume: { resumeStep: 0, phase: "survey" },
  card: { startedAt: "", lastSavedAt: "", stepLabel: "" },
};

const ENTITLEMENT = {
  hasAccess: true,
  quotaTotal: 3,
  quotaRemaining: 3,
  planEndsAt: null,
  planLabel: null,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <GrowthShellProvider>{children}</GrowthShellProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchSurveyBootstrapMock.mockReset();
});

describe("GrowthShellProvider", () => {
  test("부트스트랩을 받으면 openReport 와 이용권을 노출한다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        openReport: OPEN,
        entitlement: ENTITLEMENT,
        reports: [],
      },
    });
    const { result } = renderHook(() => useGrowthShell(), { wrapper });
    expect(result.current.openReport).toBeNull();
    expect(result.current.entitlement).toBeNull();
    await waitFor(() => expect(result.current.openReport?.id).toBe("r1"));
    expect(result.current.entitlement).toEqual(ENTITLEMENT);
  });

  test("완료 리포트가 있으면 가장 최근 id 를 노출한다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        openReport: null,
        entitlement: ENTITLEMENT,
        reports: [
          { id: "new", issuedAt: "2026-10-05T00:00:00Z", track: "고2" },
          { id: "old", issuedAt: "2026-09-01T00:00:00Z", track: "고1" },
        ],
      },
    });
    const { result } = renderHook(() => useGrowthShell(), { wrapper });
    await waitFor(() =>
      expect(result.current.latestCompletedReportId).toBe("new"),
    );
  });

  test("이름은 profiles 에서, 학년은 부트스트랩 프로필에서 읽는다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        openReport: null,
        entitlement: ENTITLEMENT,
        reports: [],
        profile: { grade: "고2" },
      },
    });
    const { result } = renderHook(() => useGrowthShell(), { wrapper });
    expect(result.current.studentName).toBeNull();
    expect(result.current.gradeLabel).toBeNull();
    await waitFor(() => expect(result.current.studentName).toBe("QA학생"));
    await waitFor(() => expect(result.current.gradeLabel).toBe("고2"));
  });

  test("부트스트랩이 실패하면 값은 null 이고 오류가 노출된다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "내부 오류",
    });
    const { result } = renderHook(() => useGrowthShell(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapError).not.toBeNull());
    expect(result.current.openReport).toBeNull();
    expect(result.current.latestCompletedReportId).toBeNull();
  });

  test("refetchBootstrap 이 다시 조회한다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        openReport: null,
        entitlement: ENTITLEMENT,
        reports: [],
      },
    });
    const { result } = renderHook(() => useGrowthShell(), { wrapper });
    await waitFor(() => expect(result.current.entitlement).not.toBeNull());
    await act(async () => {
      await result.current.refetchBootstrap();
    });
    expect(fetchSurveyBootstrapMock).toHaveBeenCalledTimes(2);
  });

  test("프로바이더 밖에서 쓰면 던진다", () => {
    expect(() => renderHook(() => useGrowthShell())).toThrow();
  });
});

describe("useGrowthScreenStep", () => {
  function Screen() {
    useGrowthScreenStep(2);
    return null;
  }
  function Probe() {
    const { currentStep } = useGrowthShell();
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
    fetchSurveyBootstrapMock.mockResolvedValue({ kind: "timeout" });
    const client = new QueryClient();
    const tree = (showScreen: boolean) => (
      <QueryClientProvider client={client}>
        <GrowthShellProvider>
          <Harness showScreen={showScreen} />
        </GrowthShellProvider>
      </QueryClientProvider>
    );
    const view = render(tree(false));
    expect(screen.getByTestId("step").textContent).toBe("null");
    view.rerender(tree(true));
    expect(screen.getByTestId("step").textContent).toBe("2");
    view.rerender(tree(false));
    expect(screen.getByTestId("step").textContent).toBe("null");
  });
});
