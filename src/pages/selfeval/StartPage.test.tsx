import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SelfevalApiError } from "@/lib/selfeval/queries";

const {
  shellMock,
  stepMock,
  navigateMock,
  discardMock,
  sessionMock,
  toastMock,
} = vi.hoisted(() => ({
  shellMock: vi.fn(),
  stepMock: vi.fn(),
  navigateMock: vi.fn(),
  discardMock: vi.fn(),
  sessionMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({ discardSession: discardMock }));
vi.mock("@/context/SessionContext", () => ({ useSession: sessionMock }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import StartPage from "./StartPage";

const refetchEntry = vi.fn();

const GROWTH = {
  reportId: "r1",
  issuedAt: "2026-09-14T00:00:00Z",
  stale: false,
  banner: {
    theme: "자료를 직접 만들고 검증하는 사람",
    stageLabel: "꽃",
    currentSubtheme: "내가 만든 숫자가 말을 만든다",
    weakAxisNames: ["탐구 깊이"],
    issuedAt: "2026-09-14T00:00:00Z",
  },
  planItems: [],
};

const OPEN = {
  id: "s1",
  status: "draft",
  currentStep: 2,
  route: "analysis",
  area: "subject",
  subject: "수학",
  activityName: null,
  lastActivityAt: "2026-10-01T00:00:00Z",
};

function makeEntry(over: Record<string, unknown> = {}) {
  return {
    quota: null,
    allowed: true,
    activityCount: 17,
    openSession: null,
    growth: null,
    profile: {
      gradeLabel: "고2",
      semester: 2,
      career: "도시공학자",
      department: "도시공학과",
      universities: [],
    },
    replyResent: 0,
    academicYearDefault: 2026,
    ...over,
  };
}

function setShell(over: Record<string, unknown> = {}, entry = makeEntry()) {
  shellMock.mockReturnValue({
    entry,
    openSession: entry.openSession,
    studentName: "큐에이학생",
    isEntryLoading: false,
    entryError: null,
    refetchEntry,
    ...over,
  });
}

function setQuota(remaining: number | null = 7, total: number | null = 10) {
  sessionMock.mockReturnValue({
    userId: "u1",
    quotaRemaining: remaining,
    quotaTotal: total,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  setQuota();
});

describe("StartPage 로딩과 오류", () => {
  test("진입 정보를 기다리는 동안 로딩 상태를 보여 준다", () => {
    setShell({ entry: null, isEntryLoading: true });
    renderPage();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });

  test("조회 실패 시 오류 메시지와 다시 시도 버튼을 보여 주고 누르면 재조회한다", () => {
    setShell({
      entry: null,
      entryError: new SelfevalApiError({
        kind: "error",
        status: 500,
        code: "INTERNAL",
        message: "x",
      }),
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetchEntry).toHaveBeenCalled();
  });
});

describe("StartPage 기본 화면", () => {
  test("1단계로 알리고 제목과 부제를 그린다", () => {
    setShell();
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(1);
    expect(
      screen.getByRole("heading", { name: "위닝 자기평가서" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "기록에서 고르고, 쓰고, 검증하는 자기평가서 작성 도구입니다",
      ),
    ).toBeTruthy();
  });

  test("학생 카드에 이름과 학년 학기 희망 학과를 보여 준다", () => {
    setShell();
    renderPage();
    expect(screen.getByText("큐에이학생님, 반갑습니다")).toBeTruthy();
    expect(screen.getByText("고2 2학기, 도시공학과 희망")).toBeTruthy();
  });

  test("이름과 프로필이 없으면 그 줄을 그리지 않는다", () => {
    setShell({ studentName: null }, makeEntry({ profile: null }));
    renderPage();
    expect(screen.getByText("반갑습니다")).toBeTruthy();
    expect(screen.queryByText(/희망$/)).toBeNull();
  });

  test("통계 3칸에 이용 가능 횟수, 저장된 활동, 작성 중인 자기평가서를 보여 준다", () => {
    setShell();
    renderPage();
    expect(screen.getByText("이용 가능 횟수")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("/ 10회")).toBeTruthy();
    expect(screen.getByText("저장된 활동")).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();
    expect(screen.getByText("작성 중인 자기평가서")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  test("이용 횟수를 모르면 그 칸을 그리지 않는다", () => {
    setQuota(null, null);
    setShell();
    renderPage();
    expect(screen.queryByText("이용 가능 횟수")).toBeNull();
  });

  test("열린 세션이 있으면 작성 중인 자기평가서는 1건이다", () => {
    setShell({}, makeEntry({ openSession: OPEN }));
    renderPage();
    expect(screen.getByText("1")).toBeTruthy();
  });
});

describe("성장설계 배너", () => {
  test("성장설계가 없으면 배너를 그리지 않는다", () => {
    setShell();
    renderPage();
    expect(screen.queryByText("성장설계 방향")).toBeNull();
  });

  test("성장설계가 있으면 대주제와 칩과 발행일을 보여 준다", () => {
    setShell({}, makeEntry({ growth: GROWTH }));
    renderPage();
    expect(screen.getByText("성장설계 방향")).toBeTruthy();
    expect(screen.getByText("자료를 직접 만들고 검증하는 사람")).toBeTruthy();
    expect(screen.getByText("꽃")).toBeTruthy();
    expect(screen.getByText("내가 만든 숫자가 말을 만든다")).toBeTruthy();
    expect(screen.getByText("부족 축 탐구 깊이")).toBeTruthy();
    expect(screen.getByText(/2026년 9월 14일/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "다시 받기" })).toBeNull();
  });

  test("발행이 오래됐으면 경과 안내와 다시 받기 링크를 보여 준다", () => {
    setShell(
      {},
      makeEntry({
        growth: { ...GROWTH, stale: true, issuedAt: "2020-01-01T00:00:00Z" },
      }),
    );
    renderPage();
    expect(screen.getByText(/발행일이 \d+개월 지났어요/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "다시 받기" }).getAttribute("href"),
    ).toBe("/app/growth");
  });
});

describe("행동 줄", () => {
  test("새로 시작하면 새 자기평가서 만들기가 기본 입력으로 이동한다", () => {
    setShell();
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "새 자기평가서 만들기" }),
    );
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new");
  });

  test("열린 세션이 있으면 이어서 작성하기가 단계에 맞는 화면으로 이동한다", () => {
    setShell({}, makeEntry({ openSession: OPEN }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "이어서 작성하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/analysis");
    expect(
      screen.queryByRole("button", { name: "새 자기평가서 만들기" }),
    ).toBeNull();
  });

  test("새로 만들기는 파기 확인을 거쳐 세션을 파기하고 기본 입력으로 이동한다", async () => {
    discardMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    setShell({}, makeEntry({ openSession: OPEN }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "새로 만들기" }));
    expect(discardMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "파기하고 새로 만들기" }),
    );
    await waitFor(() => expect(discardMock).toHaveBeenCalledWith("s1"));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new"),
    );
    expect(refetchEntry).toHaveBeenCalled();
  });

  test("파기에 실패하면 이동하지 않고 오류를 알린다", async () => {
    discardMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "찾을 수 없어요",
    });
    setShell({}, makeEntry({ openSession: OPEN }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "새로 만들기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "파기하고 새로 만들기" }),
    );
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("이용 횟수가 0이면 만들기를 막고 이용권 보러 가기를 안내한다", () => {
    setQuota(0, 10);
    setShell();
    renderPage();
    expect(
      (
        screen.getByRole("button", {
          name: "새 자기평가서 만들기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이용권 보러 가기" }));
    expect(navigateMock).toHaveBeenCalledWith("/pricing?service=selfeval");
  });

  test("저장된 활동이 0건이면 직접 입력으로 시작하기가 1순위 버튼이다", () => {
    setShell({}, makeEntry({ activityCount: 0 }));
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "직접 입력으로 시작하기" }),
    );
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new?manual=1");
    expect(
      screen.queryByRole("button", { name: "새 자기평가서 만들기" }),
    ).toBeNull();
  });
});
