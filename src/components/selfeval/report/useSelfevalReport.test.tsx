import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ReportView } from "@/lib/selfeval/reportTypes";
import { SAMPLE_PAYLOAD } from "./testFixtures";

const { fetchReportMock, buildReportMock } = vi.hoisted(() => ({
  fetchReportMock: vi.fn(),
  buildReportMock: vi.fn(),
}));

vi.mock("@/lib/selfeval/api", () => ({
  fetchReport: fetchReportMock,
  buildReport: buildReportMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));

import { useSelfevalReport } from "./useSelfevalReport";

const view = (over: Partial<ReportView> = {}): ReportView => ({
  sessionId: "s1",
  finalRevision: 1,
  status: "ready",
  attempts: 1,
  builtAt: "2026-11-10T00:00:00Z",
  payload: SAMPLE_PAYLOAD,
  ...over,
});
const ok = (report: ReportView) => ({
  kind: "ok" as const,
  data: { ok: true as const, report },
});
const notFound = {
  kind: "error" as const,
  status: 404,
  code: "REPORT_NOT_FOUND",
  message: "none",
};
const failure = {
  kind: "error" as const,
  status: 500,
  code: "REPORT_FAILED",
  message: "fail",
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSelfevalReport("s1"), { wrapper });
}

beforeEach(() => {
  fetchReportMock.mockReset();
  buildReportMock.mockReset();
});

describe("useSelfevalReport", () => {
  test("저장된 리포트가 있으면 만들지 않고 ready 로 돌려준다", async () => {
    fetchReportMock.mockResolvedValue(ok(view()));
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.payload).toBe(SAMPLE_PAYLOAD);
    expect(buildReportMock).not.toHaveBeenCalled();
  });

  test("리포트가 없으면(404) 자동으로 한 번만 만들고 진행 중을 거쳐 ready 가 된다", async () => {
    fetchReportMock.mockResolvedValue({ ...notFound });
    let release: (v: unknown) => void = () => {};
    buildReportMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("building"));
    await act(async () => release(ok(view())));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(buildReportMock).toHaveBeenCalledTimes(1);
    expect(buildReportMock).toHaveBeenCalledWith("s1");
  });

  test("만들기가 실패하면 failed 이고 자동으로 다시 부르지 않는다, 다시 만들기는 한 번 더 부른다", async () => {
    fetchReportMock.mockResolvedValue({ ...notFound });
    buildReportMock.mockResolvedValueOnce(failure);
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.payload).toBeNull();
    expect(buildReportMock).toHaveBeenCalledTimes(1);

    buildReportMock.mockResolvedValueOnce(ok(view()));
    await act(async () => {
      await result.current.rebuild();
    });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(buildReportMock).toHaveBeenCalledTimes(2);
  });

  test("저장본이 failed 상태면 자동으로 부르지 않고 failed 로 둔다", async () => {
    fetchReportMock.mockResolvedValue(
      ok(view({ status: "failed", payload: null })),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(buildReportMock).not.toHaveBeenCalled();
  });
});
