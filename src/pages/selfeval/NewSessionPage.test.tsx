import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  shellMock,
  stepMock,
  navigateMock,
  createMock,
  updateMock,
  discardMock,
  detailMock,
  saveProfileMock,
  toastMock,
} = vi.hoisted(() => ({
  shellMock: vi.fn(),
  stepMock: vi.fn(),
  navigateMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  discardMock: vi.fn(),
  detailMock: vi.fn(),
  saveProfileMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  createSession: createMock,
  updateSession: updateMock,
  discardSession: discardMock,
  fetchSessionDetail: detailMock,
  fetchEntry: vi.fn(),
  pickList: vi.fn(),
}));
vi.mock("@/components/selfeval/basics/profileApi", () => ({
  saveBasicsProfile: saveProfileMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import NewSessionPage from "./NewSessionPage";

const refetchEntry = vi.fn();

const PROFILE = {
  gradeLabel: "고2",
  semester: 2,
  career: "데이터 분석가",
  department: "통계학과",
  universities: ["가대학교"],
};

const GROWTH = {
  reportId: "r1",
  issuedAt: "2026-09-14T00:00:00Z",
  stale: false,
  banner: {
    theme: "자료를 직접 만드는 사람",
    stageLabel: "꽃",
    currentSubtheme: null,
    weakAxisNames: [],
    issuedAt: "2026-09-14T00:00:00Z",
  },
  planItems: [
    {
      id: "p1",
      title: "통계 탐구 설계",
      description: null,
      axis: null,
      category: null,
    },
    {
      id: "p2",
      title: "동아리 설문",
      description: null,
      axis: null,
      category: null,
    },
  ],
};

function makeEntry(over: Record<string, unknown> = {}) {
  return {
    quota: null,
    allowed: true,
    activityCount: 5,
    openSession: null,
    growth: null,
    profile: PROFILE,
    replyResent: 0,
    academicYearDefault: 2026,
    ...over,
  };
}

function setShell(entry: ReturnType<typeof makeEntry> | null = makeEntry()) {
  shellMock.mockReturnValue({
    entry,
    openSession: entry?.openSession ?? null,
    isEntryLoading: false,
    entryError: null,
    refetchEntry,
  });
}

function renderPage(url = "/app/selfeval/new") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <NewSessionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SESSION = { id: "s1", currentStep: 1 };

function fillRequired(subject = "수학", prompt = "수학 탐구 활동을 쓰세요") {
  fireEvent.change(screen.getByLabelText("과목명"), {
    target: { value: subject },
  });
  fireEvent.change(screen.getByLabelText("학교 문항 전문"), {
    target: { value: prompt },
  });
}

function submit() {
  fireEvent.click(
    screen.getByRole("button", { name: "이 조건으로 활동 찾기" }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  saveProfileMock.mockResolvedValue({ ok: true });
  createMock.mockResolvedValue({
    kind: "ok",
    data: { ok: true, session: SESSION },
  });
  setShell();
});

describe("NewSessionPage 화면", () => {
  test("2단계로 알리고 제목을 그린다", () => {
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(2);
    expect(
      screen.getByRole("heading", { name: "어떤 자기평가서를 쓸까요" }),
    ).toBeTruthy();
  });

  test("진입 정보를 기다리는 동안은 폼 대신 로딩을 보여 준다", () => {
    shellMock.mockReturnValue({
      entry: null,
      isEntryLoading: true,
      entryError: null,
      refetchEntry,
    });
    renderPage();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
    expect(screen.queryByLabelText("과목명")).toBeNull();
  });

  test("프로필 값과 학년도 기본값이 초기값으로 채워진다", () => {
    renderPage();
    expect((screen.getByLabelText("학년도") as HTMLSelectElement).value).toBe(
      "2026",
    );
    expect((screen.getByLabelText("학년") as HTMLSelectElement).value).toBe(
      "고2",
    );
    expect((screen.getByLabelText("학기") as HTMLSelectElement).value).toBe(
      "2",
    );
    expect((screen.getByLabelText("희망 진로") as HTMLInputElement).value).toBe(
      "데이터 분석가",
    );
    expect((screen.getByLabelText("희망 학과") as HTMLInputElement).value).toBe(
      "통계학과",
    );
    expect(
      (screen.getByLabelText("희망 대학 1") as HTMLInputElement).value,
    ).toBe("가대학교");
    expect(
      (screen.getByLabelText("목표 글자 수") as HTMLInputElement).value,
    ).toBe("500");
    expect(screen.queryByText(/처음 오셨네요/)).toBeNull();
  });

  test("프로필이 없으면 비운 채 안내를 보여 준다", () => {
    setShell(makeEntry({ profile: null }));
    renderPage();
    expect(
      screen.getByText(
        "처음 오셨네요. 학년과 진로를 입력하면 다음부터 채워져요",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("학년") as HTMLSelectElement).value).toBe("");
  });

  test("영역을 창체로 바꾸면 과목명 대신 활동명을 묻는다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "동아리" }));
    expect(screen.queryByLabelText("과목명")).toBeNull();
    expect(screen.getByLabelText("활동명")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "동아리" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("목표 글자 수를 비우면 분량 판정이 꺼진다는 안내를 보여 준다", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("목표 글자 수"), {
      target: { value: "" },
    });
    expect(screen.getByText(/분량 판정만 꺼져요/)).toBeTruthy();
  });

  test("목표 글자 수와 학교 기재 한도가 다르다는 안내를 항상 보여 준다", () => {
    renderPage();
    expect(
      screen.getByText("목표 글자 수와 학교 기재 한도는 다른 값이에요"),
    ).toBeTruthy();
    expect(
      screen.getByText("완성된 문장에 대학 이름은 넣지 않아요"),
    ).toBeTruthy();
  });
});

describe("검증", () => {
  test("과목명과 문항을 비우고 제출하면 인라인 오류를 보이고 요청하지 않는다", () => {
    renderPage();
    submit();
    expect(screen.getByText("과목명을 입력해 주세요.")).toBeTruthy();
    expect(
      screen.getByText("학교에서 받은 문항을 입력해 주세요."),
    ).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
    expect(saveProfileMock).not.toHaveBeenCalled();
  });

  test("창체 영역은 활동명이 비면 활동명 오류를 보인다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "자율" }));
    fireEvent.change(screen.getByLabelText("학교 문항 전문"), {
      target: { value: "문항" },
    });
    submit();
    expect(screen.getByText("활동명을 입력해 주세요.")).toBeTruthy();
  });
});

describe("성장설계 카드", () => {
  test("성장설계가 없으면 카드를 그리지 않는다", () => {
    renderPage();
    expect(
      screen.queryByText("이 방향을 이번 자기평가서에 적용합니다"),
    ).toBeNull();
  });

  test("성장설계가 있으면 적용이 켜져 있고 과제를 고를 수 있다", () => {
    setShell(makeEntry({ growth: GROWTH }));
    renderPage();
    const toggle = screen.getByRole("switch", {
      name: "이 방향을 이번 자기평가서에 적용합니다",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("통계 탐구 설계")).toBeTruthy();
    expect(screen.getByText("동아리 설문")).toBeTruthy();
  });

  test("방향을 해제하면 과제 카드가 사라진다", () => {
    setShell(makeEntry({ growth: GROWTH }));
    renderPage();
    fireEvent.click(
      screen.getByRole("switch", {
        name: "이 방향을 이번 자기평가서에 적용합니다",
      }),
    );
    expect(screen.queryByText("통계 탐구 설계")).toBeNull();
  });

  test("고른 과제는 생성 요청에 실리고 해제하면 빠진다", async () => {
    setShell(makeEntry({ growth: GROWTH }));
    renderPage();
    fillRequired();
    fireEvent.click(screen.getByRole("radio", { name: /통계 탐구 설계/ }));
    submit();
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      growthApplied: true,
      planItemId: "p1",
    });
  });
});

describe("제출", () => {
  test("프로필을 먼저 저장하고 세션을 만든 뒤 활동 선택으로 이동한다", async () => {
    renderPage();
    fillRequired();
    submit();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/app/selfeval/s/s1/activities",
      ),
    );
    expect(saveProfileMock).toHaveBeenCalledWith("u1", {
      grade: "고2",
      semester: 2,
      career: "데이터 분석가",
      department: "통계학과",
      universities: ["가대학교"],
    });
    expect(saveProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0] as number,
    );
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      academicYear: 2026,
      gradeLabel: "고2",
      semester: 2,
      area: "subject",
      subject: "수학",
      schoolPrompt: "수학 탐구 활동을 쓰세요",
      targetChars: 500,
      targetCharsMode: "with_space",
    });
    expect(refetchEntry).toHaveBeenCalled();
  });

  test("manual 쿼리가 있으면 활동 선택으로 넘기며 유지한다", async () => {
    renderPage("/app/selfeval/new?manual=1");
    fillRequired();
    submit();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/app/selfeval/s/s1/activities?manual=1",
      ),
    );
  });

  test("프로필 저장이 실패해도 세션 생성은 계속하고 알린다", async () => {
    saveProfileMock.mockResolvedValue({ ok: false });
    renderPage();
    fillRequired();
    submit();
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(toastMock.error).toHaveBeenCalled();
  });

  test("이미 작성 중인 세션이 있으면 모달을 열고 파기 뒤 같은 입력으로 다시 만든다", async () => {
    createMock
      .mockResolvedValueOnce({
        kind: "error",
        status: 409,
        code: "SESSION_OPEN",
        message: "작성 중",
        extra: { openSessionId: "old" },
      })
      .mockResolvedValueOnce({
        kind: "ok",
        data: { ok: true, session: SESSION },
      });
    discardMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    renderPage();
    fillRequired();
    submit();
    const discard = await screen.findByRole("button", {
      name: "파기하고 새로 만들기",
    });
    fireEvent.click(discard);
    await waitFor(() => expect(discardMock).toHaveBeenCalledWith("old"));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1]?.[0]).toEqual(
      createMock.mock.calls[0]?.[0],
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/app/selfeval/s/s1/activities",
      ),
    );
  });

  test("작성 중인 세션 모달에서 이어서 하기를 누르면 그 세션 단계 화면으로 간다", async () => {
    shellMock.mockReturnValue({
      entry: makeEntry({
        openSession: {
          id: "old",
          status: "draft",
          currentStep: 2,
          route: "analysis",
          area: "subject",
          subject: "수학",
          activityName: null,
          lastActivityAt: "2026-10-01T00:00:00Z",
        },
      }),
      isEntryLoading: false,
      entryError: null,
      refetchEntry,
    });
    createMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "SESSION_OPEN",
      message: "작성 중",
      extra: { openSessionId: "old" },
    });
    renderPage();
    fillRequired();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "이어서 하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/old/analysis");
  });

  test("이용 횟수가 소진되면 안내와 이용권 링크를 보여 준다", async () => {
    createMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "QUOTA_EXHAUSTED",
      message: "소진",
    });
    renderPage();
    fillRequired();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이용 가능 횟수가 없어요",
    );
    expect(
      screen
        .getByRole("link", { name: "이용권 보러 가기" })
        .getAttribute("href"),
    ).toBe("/pricing?service=selfeval");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("서버 본문 오류는 문구를 그대로 보여 준다", async () => {
    createMock.mockResolvedValue({
      kind: "error",
      status: 400,
      code: "INVALID_BODY",
      message: "목표 글자 수를 확인해 주세요",
    });
    renderPage();
    fillRequired();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "목표 글자 수를 확인해 주세요",
    );
  });
});

describe("기본 입력 수정(sessionId 쿼리)", () => {
  const DETAIL = {
    kind: "ok",
    data: {
      ok: true,
      session: {
        id: "s1",
        status: "draft",
        currentStep: 1,
        academicYear: 2026,
        gradeLabel: "고1",
        semester: 1,
        area: "subject",
        subject: "물리",
        activityName: null,
        schoolPrompt: "기존 문항",
        teacherNote: null,
        targetChars: 700,
        targetCharsMode: "without_space",
        career: { career: null, department: null, universities: [] },
        growthApplied: false,
        growthSnapshot: null,
        planItemId: null,
      },
      activities: [],
    },
  };

  test("저장된 값으로 채우고 제출하면 새로 만들지 않고 수정한다", async () => {
    detailMock.mockResolvedValue(DETAIL);
    updateMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, session: SESSION },
    });
    renderPage("/app/selfeval/new?sessionId=s1");
    await waitFor(() =>
      expect((screen.getByLabelText("과목명") as HTMLInputElement).value).toBe(
        "물리",
      ),
    );
    expect(
      (screen.getByLabelText("학교 문항 전문") as HTMLTextAreaElement).value,
    ).toBe("기존 문항");
    expect(
      (screen.getByLabelText("목표 글자 수") as HTMLInputElement).value,
    ).toBe("700");
    submit();
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ subject: "물리" }),
      ),
    );
    expect(createMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/app/selfeval/s/s1/activities",
      ),
    );
  });

  test("활동을 고른 뒤 세션이면 수정할 수 없다고 안내하고 제출을 막는다", async () => {
    detailMock.mockResolvedValue({
      ...DETAIL,
      data: {
        ...DETAIL.data,
        session: { ...DETAIL.data.session, currentStep: 2 },
      },
    });
    renderPage("/app/selfeval/new?sessionId=s1");
    expect(
      await screen.findByText(/활동을 고른 뒤에는 기본 입력을 바꿀 수 없어요/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "이 조건으로 활동 찾기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("서버가 SESSION_LOCKED 로 거절하면 같은 안내를 보여 준다", async () => {
    detailMock.mockResolvedValue(DETAIL);
    updateMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "SESSION_LOCKED",
      message: "잠김",
    });
    renderPage("/app/selfeval/new?sessionId=s1");
    await waitFor(() =>
      expect((screen.getByLabelText("과목명") as HTMLInputElement).value).toBe(
        "물리",
      ),
    );
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "활동을 고른 뒤에는 기본 입력을 바꿀 수 없어요",
    );
  });
});
