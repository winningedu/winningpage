import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeDesign } from "@/components/inquiry/design/designFixture";
import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";

const { shellMock, stepMock, detailMock } = vi.hoisted(() => ({
  shellMock: vi.fn(),
  stepMock: vi.fn(),
  detailMock: vi.fn(),
}));

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryShell: shellMock,
  useInquiryScreenStep: stepMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/lib/inquiry/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/inquiry/api")>()),
  fetchSessionDetail: detailMock,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { ToastProvider } from "@/context/ToastContext";
import DesignPage from "./DesignPage";

const SESSION = {
  id: "s1",
  currentStep: 3,
  selectedTopicId: "t1",
  designReportId: "d1",
  latestEvaluationId: null,
};

function detail(over: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: SESSION,
      assets: [],
      topics: [],
      topic: { id: "t1" },
      design: makeDesign(),
      submission: null,
      evaluation: null,
      finalizePreview: null,
      final: null,
      handoff: null,
      ...over,
    },
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <DesignPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  stepMock.mockClear();
  detailMock.mockReset();
  shellMock.mockReturnValue({ session: SESSION, isBootstrapLoading: false });
});

describe("DesignPage", () => {
  test("3단계를 셸에 올린다", () => {
    detailMock.mockResolvedValue(detail());
    setup();
    expect(stepMock).toHaveBeenCalledWith(3);
  });

  test("상세를 읽는 동안 로딩 표시를 그린다", () => {
    detailMock.mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeVisible();
  });

  test("설계 본문과 작성 화면 이동 링크를 그린다", async () => {
    detailMock.mockResolvedValue(detail());
    setup();
    expect(
      await screen.findByRole("table", { name: "탐구 개요" }),
    ).toBeVisible();
    expect(detailMock).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("link", { name: "작성 화면으로" })).toHaveAttribute(
      "href",
      "/app/inquiry/write",
    );
  });

  test("상세 조회가 실패하면 오류 문구를 그린다", async () => {
    detailMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "서버 오류",
    });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "설계 리포트를 불러오지 못했어요",
    );
  });

  test("설계가 없으면 주제 추천으로 보내는 안내를 그린다", async () => {
    detailMock.mockResolvedValue(detail({ design: null }));
    setup();
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "주제 추천으로 돌아가기" }),
      ).toHaveAttribute("href", "/app/inquiry/topics"),
    );
  });

  test("PDF 저장을 누르면 설계 본문 HTML과 주제 제목 파일명으로 서버 PDF를 요청한다", async () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      true,
    );
    vi.spyOn(downloadReportPdfModule, "getReportAccessToken").mockResolvedValue(
      "test-token",
    );
    const buildSpy = vi
      .spyOn(buildPrintDocumentModule, "buildPrintDocument")
      .mockReturnValue("<html>design</html>");
    const downloadSpy = vi
      .spyOn(downloadReportPdfModule, "downloadReportPdf")
      .mockImplementation(() => {});
    detailMock.mockResolvedValue(
      detail({ topic: { id: "t1", detail: { title: "효소 활성 탐구" } } }),
    );
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "PDF 저장" }));

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledTimes(1));
    const built = buildSpy.mock.calls[0]?.[0];
    expect(built?.root).toContainElement(
      screen.getByRole("table", { name: "탐구 개요" }),
    );
    expect(built?.title).toBe("심화탐구_설계리포트_효소 활성 탐구");
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>design</html>",
      filename: "심화탐구_설계리포트_효소 활성 탐구",
      accessToken: "test-token",
    });
  });
});
