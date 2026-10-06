import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchReportsMock, stepMock } = vi.hoisted(() => ({
  fetchReportsMock: vi.fn(),
  stepMock: vi.fn(),
}));

vi.mock("@/lib/inquiry/api", () => ({ fetchReports: fetchReportsMock }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryScreenStep: stepMock,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title, subcopy }: { title: string; subcopy?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subcopy}</p>
    </header>
  ),
}));

import ReportsPage from "./ReportsPage";

const item = (id: string, subject: string) => ({
  sessionId: id,
  completedAt: "2026-09-30T00:00:00.000Z",
  subject,
  topicTitle: `${subject} 주제`,
  linkKind: "followup",
  score: 80,
  label: "ready_with_minor_edits",
});

function ok(partial: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: { ok: true, items: [], open: null, archived: [], ...partial },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportsPage", () => {
  beforeEach(() => {
    fetchReportsMock.mockReset();
    stepMock.mockClear();
  });
  afterEach(cleanup);

  it("단계 밖 화면이라 단계를 비우고 제목과 부제를 그린다", async () => {
    fetchReportsMock.mockResolvedValue(ok());
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(null);
    expect(
      screen.getByRole("heading", { name: "심화탐구 보관함" }),
    ).toBeVisible();
    expect(
      screen.getByText("지금까지 만든 심화탐구 리포트를 모았어요"),
    ).toBeVisible();
  });

  it("불러오는 동안 스켈레톤을 그린다", () => {
    fetchReportsMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("목록이 비면 빈 상태를 그린다", async () => {
    fetchReportsMock.mockResolvedValue(ok());
    renderPage();
    expect(
      await screen.findByText(
        "아직 만든 심화탐구가 없어요. 정보 입력에서 시작해요",
      ),
    ).toBeVisible();
  });

  it("행을 표로 그리고 과목 필터로 거른다", async () => {
    fetchReportsMock.mockResolvedValue(
      ok({ items: [item("s1", "수학"), item("s2", "물리")] }),
    );
    renderPage();
    expect(await screen.findByText("수학 주제")).toBeVisible();
    expect(screen.getByText("물리 주제")).toBeVisible();
    fireEvent.change(screen.getByLabelText("과목"), {
      target: { value: "물리" },
    });
    expect(screen.queryByText("수학 주제")).toBeNull();
    expect(screen.getByText("물리 주제")).toBeVisible();
  });

  it("일반 오류는 문구와 다시 시도 버튼을 그린다", async () => {
    fetchReportsMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByText("보관함을 불러오지 못했어요."),
    ).toBeVisible();
    fetchReportsMock.mockResolvedValue(ok());
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(2));
  });

  it("이용권이 없으면 이용권 보기 링크를 그린다", async () => {
    fetchReportsMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByRole("link", { name: "이용권 보기" }),
    ).toHaveAttribute("href", "/pricing?service=inquiry");
  });
});
