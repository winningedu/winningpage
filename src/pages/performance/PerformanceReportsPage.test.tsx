import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { detailMock } = vi.hoisted(() => ({ detailMock: vi.fn() }));

vi.mock("@/lib/performance/reports", () => ({
  fetchSavedReportsList: vi.fn(),
  fetchSavedReportDetail: detailMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ session: { access_token: "token" }, userId: "u1" }),
}));

import { ToastProvider } from "@/context/ToastContext";
import PerformanceReportsPage from "./PerformanceReportsPage";

function detail() {
  return {
    session: {
      sessionId: "s1",
      topicTitle: "기후 변화 탐구",
      gradeLabel: "고2",
    },
    design: null,
    evaluation: null,
    final: {
      reportId: "f1",
      updatedAt: "2026-10-16T03:00:00Z",
      sections: [
        { id: "intro", label: "서론", text: "서론 본문 문장이다." },
        { id: "body", label: "본론", text: "본론 본문 문장이다." },
      ],
    },
  };
}

function renderPage() {
  // 셸(PerformanceAppLayout)이 채워 두는 bootstrap 캐시를 그대로 시드한다.
  const queryClient = new QueryClient();
  queryClient.setQueryData(["performance", "bootstrap", "u1"], {
    profile: { name: "김민준", schoolType: null },
    lastSession: null,
    latestDraft: null,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/app/performance/reports/s1"]}>
          <Routes>
            <Route
              path="/app/performance/reports/:sessionId"
              element={<PerformanceReportsPage />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("PerformanceReportsPage 최종 제출본 전체 복사", () => {
  beforeEach(() => {
    detailMock.mockReset();
    detailMock.mockResolvedValue(detail());
  });
  afterEach(() => {
    cleanup();
  });

  it("전체 복사는 보고 있는 최종 제출본 표면의 글을 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /최종 제출본/ }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("서론");
    expect(copied).toContain("서론 본문 문장이다.");
    expect(copied).toContain("본론 본문 문장이다.");
    expect(await screen.findByText("복사했어요")).toBeVisible();
  });

  it("클립보드 쓰기가 실패하면 실패 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /최종 제출본/ }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 복사" }));

    expect(
      await screen.findByText(
        "복사하지 못했어요. 직접 선택해서 복사해 주세요.",
      ),
    ).toBeVisible();
  });
});

describe("PerformanceReportsPage 최종 제출본 표지", () => {
  beforeEach(() => {
    detailMock.mockReset();
    detailMock.mockResolvedValue(detail());
  });
  afterEach(() => {
    cleanup();
  });

  it("학생명, 학년, 저장일을 표지에 채운다", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /최종 제출본/ }));

    const cover = await screen.findByLabelText(/리포트 표지/);
    const info = within(cover).getByTestId("cover-info");
    expect(info).toHaveTextContent("학생명김민준");
    expect(info).toHaveTextContent("학년고등학교 2학년");
    expect(info).toHaveTextContent("저장일2026.10.16");
  });
});
