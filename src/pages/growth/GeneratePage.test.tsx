import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { shellMock, runMock, listMock } = vi.hoisted(() => ({
  shellMock: vi.fn(),
  runMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthShell: shellMock,
  useGrowthScreenStep: vi.fn(),
}));
vi.mock("@/lib/growth/api", () => ({
  runReportStep: runMock,
  fetchReports: listMock,
}));

import GeneratePage from "./GeneratePage";

function progressOf(done: number) {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i + 1,
    label: "",
    status: i < done ? "ok" : "pending",
    attempts: 0,
  }));
}

function shell(openReport: unknown) {
  return {
    openReport,
    entitlement: { quotaRemaining: 3 },
    isBootstrapLoading: false,
    refetchBootstrap: vi.fn(),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="*" element={<GeneratePage />} />
        <Route path="/app/growth/collect" element={<p>자료 올리기 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GeneratePage", () => {
  beforeEach(() => vi.clearAllMocks());

  test("커밋 전 draft 회차면 활동 선택으로 돌려보내고 생성하지 않는다", () => {
    shellMock.mockReturnValue(
      shell({ id: "r1", status: "draft", currentStep: 0 }),
    );

    renderPage();

    expect(screen.getByText("아직 리포트를 만들 수 없어요")).toBeTruthy();
    expect(runMock).not.toHaveBeenCalled();
  });

  test("진행 중 회차는 진입 즉시 끝난 단계 다음부터 호출한다", async () => {
    shellMock.mockReturnValue(
      shell({ id: "r1", status: "in_progress", currentStep: 5 }),
    );
    listMock.mockResolvedValue({
      kind: "ok",
      data: { open: { id: "r1", progress: progressOf(5) } },
    });
    runMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() =>
      expect(runMock).toHaveBeenCalledWith({ reportId: "r1", step: 6 }),
    );
    expect(await screen.findByText("5단계까지 만들어 두었어요")).toBeTruthy();
    expect(screen.getByText("5 / 8 단계 완료")).toBeTruthy();
  });

  test("생성이 실패하면 다시 시도 옆의 자료 다시 올리기로 자료 올리기 화면에 간다", async () => {
    shellMock.mockReturnValue(
      shell({ id: "r1", status: "in_progress", currentStep: 5 }),
    );
    listMock.mockResolvedValue({
      kind: "ok",
      data: { open: { id: "r1", progress: progressOf(5) } },
    });
    runMock.mockResolvedValue({ kind: "error", code: "NETWORK", message: "x" });

    renderPage();

    expect(
      await screen.findByRole("button", { name: "다시 시도" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "자료 다시 올리기" }));
    expect(await screen.findByText("자료 올리기 화면")).toBeTruthy();
  });
});
