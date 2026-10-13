import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDetailMock, stepMock } = vi.hoisted(() => ({
  fetchDetailMock: vi.fn(),
  stepMock: vi.fn(),
}));

vi.mock("@/lib/inquiry/api", () => ({
  fetchSessionDetail: fetchDetailMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryScreenStep: stepMock,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({
    title,
    subcopy,
    actions,
  }: {
    title: string;
    subcopy?: string;
    actions?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{subcopy}</p>
      {actions}
    </header>
  ),
}));
vi.mock("@/components/inquiry/design/DesignBody", () => ({
  default: () => <div data-testid="design-body" />,
}));
vi.mock("@/components/inquiry/evaluate/EvaluationBody", () => ({
  default: () => <div data-testid="evaluation-body" />,
}));

import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";
import ReportDetailPage from "./ReportDetailPage";

const topic = {
  id: "t1",
  detail: { title: "효소 활성 탐구" },
};

function detail(over: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: {
        id: "s1",
        status: "completed",
        currentStep: 6,
        completedAt: "2026-09-30T15:30:00.000Z",
      },
      topic,
      design: { overview: {} },
      evaluation: { id: "e1" },
      final: {
        topic: "효소",
        concept: "c",
        method: "m",
        result: "r",
        limitation: "l",
        numbers: [],
        sources: [],
      },
      ...over,
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/inquiry/reports/s1"]}>
        <Routes>
          <Route
            path="/app/inquiry/reports/:sessionId"
            element={<ReportDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportDetailPage", () => {
  beforeEach(() => {
    fetchDetailMock.mockReset();
    stepMock.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("확정 세션은 주제 제목, 확정 일자 부제, 설계와 평가 전문, 저장 표를 그린다", async () => {
    fetchDetailMock.mockResolvedValue(detail());
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(null);
    expect(
      await screen.findByRole("heading", { level: 1, name: "효소 활성 탐구" }),
    ).toBeVisible();
    expect(fetchDetailMock).toHaveBeenCalledWith("s1");
    expect(
      screen.getByText(
        "2026.10.01 확정. 설계 리포트와 평가 리포트를 함께 봐요",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "보관함으로" })).toHaveAttribute(
      "href",
      "/app/inquiry/reports",
    );
    expect(screen.getByTestId("design-body")).toBeInTheDocument();
    expect(screen.getByTestId("evaluation-body")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "확정 저장 내용" }),
    ).toBeInTheDocument();
  });

  it("설계나 평가가 없으면 각각 안내를 그리고 저장 표는 생략한다", async () => {
    fetchDetailMock.mockResolvedValue(
      detail({ design: null, evaluation: null, final: null }),
    );
    renderPage();
    expect(await screen.findByText("설계 리포트가 아직 없어요")).toBeVisible();
    expect(screen.getByText("평가 리포트가 아직 없어요")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("completed 가 아니면 작성 중 안내와 해당 단계 이어서 하기 버튼을 그린다", async () => {
    fetchDetailMock.mockResolvedValue(
      detail({
        session: {
          id: "s1",
          status: "in_progress",
          currentStep: 4,
          completedAt: null,
        },
        evaluation: null,
        final: null,
      }),
    );
    renderPage();
    expect(
      await screen.findByText("작성 중인 세션이에요. 이어서 하기"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "이어서 하기" })).toHaveAttribute(
      "href",
      "/app/inquiry/write",
    );
  });

  it("404 SESSION_NOT_FOUND 는 찾을 수 없음과 보관함 버튼을 그린다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "x",
    });
    renderPage();
    expect(await screen.findByText("리포트를 찾을 수 없어요")).toBeVisible();
    expect(screen.getByRole("link", { name: "보관함으로" })).toBeVisible();
  });

  it("일반 오류는 다시 시도 버튼을 그린다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByText("리포트를 불러오지 못했어요."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });

  it("불러오는 동안 스켈레톤을 그린다", () => {
    fetchDetailMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("PDF 저장을 누르면 설계와 평가 전문을 담아 주제 제목 파일명으로 서버 PDF를 요청한다", async () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      true,
    );
    vi.spyOn(downloadReportPdfModule, "getReportAccessToken").mockResolvedValue(
      "test-token",
    );
    const buildSpy = vi
      .spyOn(buildPrintDocumentModule, "buildPrintDocument")
      .mockReturnValue("<html>report</html>");
    const downloadSpy = vi
      .spyOn(downloadReportPdfModule, "downloadReportPdf")
      .mockImplementation(() => {});
    fetchDetailMock.mockResolvedValue(detail());
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "PDF 저장" }));

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledTimes(1));
    const root = buildSpy.mock.calls[0]?.[0].root;
    expect(root).toContainElement(screen.getByTestId("design-body"));
    expect(root).toContainElement(screen.getByTestId("evaluation-body"));
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>report</html>",
      filename: "심화탐구_보고서_효소 활성 탐구",
      accessToken: "test-token",
    });
  });
});
