import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { stepMock, shellMock, navigateMock, discardMock, toastMock } =
  vi.hoisted(() => ({
    stepMock: vi.fn(),
    shellMock: vi.fn(),
    navigateMock: vi.fn(),
    discardMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({ discardSession: discardMock }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import ArchivePage from "./ArchivePage";

const refetchEntry = vi.fn();

const item = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "in_progress",
  currentStep: 2,
  academicYear: 2026,
  semester: 1,
  area: "subject",
  subject: "수학",
  activityName: null,
  score: null,
  completedAt: null,
  lastActivityAt: "2026-10-01T03:00:00Z",
  expired: false,
  discarded: false,
  terminal: null,
  ...over,
});

function setShell(sessions: unknown[] | null, openSession: unknown = null) {
  shellMock.mockReturnValue({
    sessions,
    openSession,
    isEntryLoading: sessions === null,
    entryError: null,
    refetchEntry,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ArchivePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
});

describe("ArchivePage", () => {
  test("단계 밖 화면으로 알리고 행마다 제목, 상태 배지, 메타를 보인다", () => {
    setShell([
      item(),
      item({
        id: "s2",
        status: "completed",
        subject: "물리",
        score: 82,
        completedAt: "2026-10-02T03:00:00Z",
      }),
    ]);
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(null);
    expect(screen.getByRole("heading", { name: "보관함" })).toBeTruthy();
    const row = screen
      .getByText("수학 자기평가서")
      .closest("li") as HTMLElement;
    expect(within(row).getByText("작성 중")).toBeTruthy();
    expect(within(row).getByText("3단계 활동 선택까지")).toBeTruthy();
    const done = screen
      .getByText("물리 자기평가서")
      .closest("li") as HTMLElement;
    expect(within(done).getByText("완료")).toBeTruthy();
    expect(within(done).getByText("점수 82점")).toBeTruthy();
  });

  test("작성 중은 단계에 맞는 화면으로 이어서 쓴다", () => {
    setShell([item({ currentStep: 3 })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "이어서 작성하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/analysis");
  });

  test("완료는 다시 보기로 완료 화면을 연다", () => {
    setShell([item({ status: "completed" })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/done");
  });

  test("파기된 세션은 목록에 나오지 않고 상태 필터에도 파기가 없다", () => {
    setShell([
      item({ id: "d", status: "archived", discarded: true, subject: "국어" }),
      item({ id: "w", subject: "수학" }),
    ]);
    renderPage();
    expect(screen.queryByText("국어 자기평가서")).toBeNull();
    expect(screen.getByText("수학 자기평가서")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "파기" })).toBeNull();
  });

  test("열린 세션이 없으면 만료 세션의 새로 시작하기가 바로 시작 화면으로 간다", () => {
    setShell([item({ status: "archived", expired: true })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "새로 시작하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new");
    expect(discardMock).not.toHaveBeenCalled();
  });

  test("열린 세션이 있으면 파기 확인 뒤에 파기하고 새로 시작한다", async () => {
    setShell(
      [
        item({
          id: "old",
          status: "archived",
          terminal: { reason: "x", at: "t" },
        }),
      ],
      { id: "open1", currentStep: 2 },
    );
    discardMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "새로 시작하기" }));
    expect(discardMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "파기하고 새로 만들기" }),
    );
    await waitFor(() => expect(discardMock).toHaveBeenCalledWith("open1"));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new"),
    );
    expect(refetchEntry).toHaveBeenCalled();
  });

  test("필터를 걸면 조건에 맞는 행만 남는다", () => {
    setShell([
      item({ id: "a", subject: "수학" }),
      item({ id: "b", subject: "물리", status: "completed" }),
    ]);
    renderPage();
    fireEvent.change(screen.getByLabelText("상태"), {
      target: { value: "completed" },
    });
    expect(screen.queryByText("수학 자기평가서")).toBeNull();
    expect(screen.getByText("물리 자기평가서")).toBeTruthy();
  });

  test("목록이 비면 안내와 새로 만들기를 보인다", () => {
    setShell([]);
    renderPage();
    expect(screen.getByText("아직 자기평가서가 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새로 만들기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new");
  });

  test("목록을 받기 전에는 로딩을 보인다", () => {
    setShell(null);
    renderPage();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });
});
