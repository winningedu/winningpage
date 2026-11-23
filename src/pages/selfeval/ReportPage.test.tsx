import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_PAYLOAD } from "@/components/selfeval/report/testFixtures";
import type { ReportView } from "@/lib/selfeval/reportTypes";
import { makeDetail, makeReport, makeSections } from "./testFixtures";

const {
  stepMock,
  shellMock,
  detailMock,
  fetchReportMock,
  buildReportMock,
  pdfSaveMock,
  pdfNames,
  pdfRoots,
} = vi.hoisted(() => ({
  stepMock: vi.fn(),
  shellMock: vi.fn(),
  detailMock: vi.fn(),
  fetchReportMock: vi.fn(),
  buildReportMock: vi.fn(),
  pdfSaveMock: vi.fn(),
  pdfNames: [] as string[],
  pdfRoots: [] as (HTMLElement | null)[],
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  fetchSessionDetail: detailMock,
  fetchReport: fetchReportMock,
  buildReport: buildReportMock,
  fetchEntry: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/lib/report/useReportPdfSave", () => ({
  useReportPdfSave: (name: string) => {
    pdfNames.push(name);
    const contentRef = useRef<HTMLDivElement>(null);
    return {
      contentRef,
      isPreparing: false,
      save: () => {
        pdfRoots.push(contentRef.current);
        pdfSaveMock();
      },
    };
  },
}));

import ReportPage from "./ReportPage";

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

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/app/selfeval/s/s1/report"]}>
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/report"
            element={<ReportPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function completed() {
  const final = makeReport(makeSections(), { score: 82 });
  return makeDetail({
    session: {
      status: "completed",
      currentStep: 6,
      completedAt: "2026-10-02T03:00:00Z",
    },
    reports: { final },
    current: final,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  pdfNames.length = 0;
  pdfRoots.length = 0;
  shellMock.mockReturnValue({ refetchEntry: vi.fn(), studentName: "김하나" });
  detailMock.mockResolvedValue(completed());
});

describe("ReportPage", () => {
  test("저장된 리포트를 그리고 학생명은 계정에서 읽는다", async () => {
    fetchReportMock.mockResolvedValue(ok(view()));
    renderPage();
    expect(
      await screen.findByRole("region", { name: "01 자기평가 본문" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/김하나/).length).toBeGreaterThan(0);
    expect(buildReportMock).not.toHaveBeenCalled();
  });

  test("리포트가 없으면 만드는 중을 보이고 끝나면 리포트를 그린다", async () => {
    fetchReportMock.mockResolvedValue({ ...notFound });
    let release: (v: unknown) => void = () => {};
    buildReportMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderPage();
    expect(await screen.findByText("리포트를 만드는 중이에요")).toBeTruthy();
    release(ok(view()));
    expect(
      await screen.findByRole("region", { name: "01 자기평가 본문" }),
    ).toBeTruthy();
  });

  test("만들기가 실패해도 저장은 그대로라고 알리고 다시 만들기로 한 번 더 부른다", async () => {
    fetchReportMock.mockResolvedValue({ ...notFound });
    buildReportMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "REPORT_FAILED",
      message: "fail",
    });
    renderPage();
    expect(
      await screen.findByText(
        "리포트를 만들지 못했어요. 최종 저장은 그대로예요.",
      ),
    ).toBeTruthy();
    buildReportMock.mockResolvedValueOnce(ok(view()));
    fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
    await screen.findByRole("region", { name: "01 자기평가 본문" });
    expect(buildReportMock).toHaveBeenCalledTimes(2);
  });

  test("PDF 저장은 리포트 전체를 감싼 요소를 인쇄하고 파일명에 과목을 쓴다", async () => {
    fetchReportMock.mockResolvedValue(ok(view()));
    renderPage();
    await screen.findByRole("region", { name: "01 자기평가 본문" });
    fireEvent.click(screen.getByRole("button", { name: "PDF 저장" }));
    expect(pdfSaveMock).toHaveBeenCalledTimes(1);
    const root = pdfRoots[0];
    expect(
      root?.querySelector('[aria-label="자기평가 리포트 표지"]'),
    ).toBeTruthy();
    expect(
      root?.querySelector('[aria-label="05 성장 흐름과 다음 단계"]'),
    ).toBeTruthy();
    expect(pdfNames.at(-1)).toBe("자기평가서_수학");
  });

  test("최종 저장 전 세션이면 리포트를 부르지 않는다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({ session: { status: "in_progress" } }),
    );
    renderPage();
    expect(
      await screen.findByText("아직 최종본으로 저장하지 않았어요"),
    ).toBeTruthy();
    await waitFor(() => expect(fetchReportMock).not.toHaveBeenCalled());
  });
});
