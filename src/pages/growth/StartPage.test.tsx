import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GrowthApiError } from "@/lib/growth/queries";

const { shellMock, stepMock, navigateMock, saveMock, promoteMock, toastMock } =
  vi.hoisted(() => ({
    shellMock: vi.fn(),
    stepMock: vi.fn(),
    navigateMock: vi.fn(),
    saveMock: vi.fn(),
    promoteMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));

vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthShell: shellMock,
  useGrowthScreenStep: stepMock,
}));
vi.mock("@/components/growth/start/profileApi", () => ({
  saveStudentProfile: saveMock,
  promoteGrade: promoteMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import StartPage from "./StartPage";

const refetchBootstrap = vi.fn();

const FULL_PROFILE = {
  school_type: "일반고",
  admission_year: 2025,
  grade: "고2",
  semester: 2,
  career: "도시 데이터 분석",
  department: "도시공학과",
  universities: ["서울시립대학교", "건국대학교"],
};

function makeBootstrap(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    questions: Array.from({ length: 24 }, (_, i) => ({ key: `q${i + 1}` })),
    entitlement: {
      hasAccess: true,
      quotaTotal: 3,
      quotaRemaining: 3,
      planEndsAt: null,
      planLabel: null,
    },
    profile: FULL_PROFILE,
    profileInitial: null,
    openReport: null,
    activityOverview: {
      total: 14,
      bySource: {},
      byGroup: { curricular: 11, extracurricular: 3, unclassified: 0 },
      firstYear: { count: 4, level: "low", label: "부족" },
    },
    reports: [{ id: "r0", issuedAt: "2026-09-01T00:00:00Z", track: null }],
    archivedCount: 0,
    prefill: { survey: null, autoFilled: {}, previousAnswers: null },
    promotion: null,
    ...over,
  };
}

function setShell(
  over: Record<string, unknown> = {},
  bootstrap = makeBootstrap(),
) {
  shellMock.mockReturnValue({
    bootstrap,
    openReport: bootstrap.openReport,
    entitlement: bootstrap.entitlement,
    studentName: "큐에이학생",
    isBootstrapLoading: false,
    bootstrapError: null,
    refetchBootstrap,
    ...over,
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
  sessionStorage.clear();
  refetchBootstrap.mockResolvedValue(undefined);
});

describe("StartPage 로딩과 오류", () => {
  test("부트스트랩을 기다리는 동안 로딩 상태를 보여 준다", () => {
    setShell({ bootstrap: null, isBootstrapLoading: true });
    renderPage();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
    expect(screen.queryByText("학생 조사 시작하기")).toBeNull();
  });

  test("조회 실패 시 오류 메시지와 다시 시도 버튼을 보여 주고 누르면 재조회한다", () => {
    setShell({
      bootstrap: null,
      bootstrapError: new GrowthApiError({
        kind: "error",
        status: 500,
        code: "INTERNAL",
        message: "x",
      } as never),
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetchBootstrap).toHaveBeenCalled();
  });
});

describe("StartPage 기본 화면", () => {
  test("시작 화면은 1단계로 알리고 제목과 부제를 그린다", () => {
    setShell();
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(1);
    expect(screen.getByRole("heading", { name: "위닝 성장설계" })).toBeTruthy();
    expect(screen.getByText("내 자료를 확인하고 시작합니다.")).toBeTruthy();
  });

  test("학생 카드에 이름, 학년 학기 희망 학과, 이용권 배지를 보여 준다", () => {
    setShell();
    renderPage();
    expect(screen.getByText("큐에이학생님, 반갑습니다")).toBeTruthy();
    expect(screen.getByText("고2 2학기, 도시공학과 희망")).toBeTruthy();
    expect(screen.getByText("이용권 3회")).toBeTruthy();
  });

  test("이용권 잔여를 모르면 배지를 그리지 않는다", () => {
    const b = makeBootstrap();
    b.entitlement.quotaRemaining = null as never;
    setShell({}, b);
    renderPage();
    expect(screen.queryByText(/^이용권 .*회$/)).toBeNull();
  });

  test("이름이 없으면 이름 없이 인사한다", () => {
    setShell({ studentName: null });
    renderPage();
    expect(screen.getByText("반갑습니다")).toBeTruthy();
  });

  test("학생 정보 카드는 값이 있는 줄만 그린다", () => {
    const b = makeBootstrap({
      profile: { ...FULL_PROFILE, career: null, universities: [] },
    });
    setShell({}, b);
    renderPage();
    expect(screen.getByText("일반고")).toBeTruthy();
    expect(screen.getByText("2025학년도")).toBeTruthy();
    expect(screen.getByText("고2 2학기")).toBeTruthy();
    expect(screen.getByText("도시공학과")).toBeTruthy();
    expect(screen.queryByText("희망 진로")).toBeNull();
    expect(screen.queryByText("희망 대학")).toBeNull();
  });

  test("시작 전 확인 카드에 활동 건수, 1학년 충분도, 문항 수를 보여 준다", () => {
    setShell();
    renderPage();
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText("교과 11건, 창체 3건")).toBeTruthy();
    expect(screen.getByText("부족")).toBeTruthy();
    expect(screen.getByText("1학년 활동 4건이에요")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("약 10분 걸려요")).toBeTruthy();
    expect(screen.getByText("학생 조사 24문항, 현재 학년, 성적")).toBeTruthy();
    expect(screen.getByText("리포트 3부 37항목, 실행계획")).toBeTruthy();
  });

  test("주 버튼은 학생 조사 화면으로, 보조 버튼은 지난 리포트로 이동한다", () => {
    setShell();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "학생 조사 시작하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/growth/survey");
    fireEvent.click(screen.getByRole("button", { name: "지난 리포트 보기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/growth/reports");
  });

  test("완료 리포트도 미완 회차도 없으면 지난 리포트 보기는 비활성이다", () => {
    setShell({}, makeBootstrap({ reports: [] }));
    renderPage();
    expect(
      (
        screen.getByRole("button", {
          name: "지난 리포트 보기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

const OPEN = {
  id: "rep1",
  status: "draft",
  currentStep: 0,
  track: null,
  answered: 13,
  total: 24,
  answers: {},
  lastActivityAt: "2026-11-05T21:40:00",
  startedAt: "2026-11-02T10:00:00",
  resume: { resumeStep: 2, phase: "collect" },
  card: {
    startedAt: "2026-11-02T10:00:00",
    lastSavedAt: "2026-11-05T21:40:00",
    stepLabel: "2단계 학생 조사",
  },
};

describe("StartPage 미완 회차", () => {
  test("미완 카드에 시작일, 단계, 답한 문항, 마지막 저장, 진행 바를 보여 준다", () => {
    setShell({}, makeBootstrap({ openReport: OPEN }));
    renderPage();
    expect(screen.getByText("작성 중인 회차가 있어요")).toBeTruthy();
    expect(
      screen.getByText(
        "2026년 11월 2일 시작, 2단계 학생 조사, 24문항 중 13문항 답함, 마지막 저장 2026.11.05 21:40",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "54",
    );
  });

  test("주 버튼이 이어서 하기로 바뀌고 회차 단계의 화면으로 이동한다", () => {
    setShell({}, makeBootstrap({ openReport: OPEN }));
    renderPage();
    expect(screen.queryByText("학생 조사 시작하기")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/growth/collect");
  });

  test("이용권이 0회여도 미완 회차는 이어서 할 수 있다", () => {
    const b = makeBootstrap({ openReport: OPEN });
    b.entitlement.quotaRemaining = 0;
    setShell({}, b);
    renderPage();
    expect(screen.getByRole("button", { name: "이어서 하기" })).toBeTruthy();
    expect(screen.queryByText("이용권이 없어요")).toBeNull();
  });
});

describe("StartPage 이용권 없음", () => {
  test("주 버튼 대신 안내와 구매 버튼을 보여 주고 구매 페이지로 보낸다", () => {
    const b = makeBootstrap();
    b.entitlement.quotaRemaining = 0;
    setShell({}, b);
    renderPage();
    expect(screen.getByText("이용권이 없어요")).toBeTruthy();
    expect(screen.queryByText("학생 조사 시작하기")).toBeNull();
    expect(screen.getByText("이용권 0회")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이용권 구매하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/pricing?service=growth");
  });
});

describe("StartPage 학생 정보 입력", () => {
  test("student_profiles 가 없으면 처음부터 입력 폼이고 목표관리 초기값이 채워진다", () => {
    setShell(
      {},
      makeBootstrap({
        profile: null,
        profileInitial: {
          department: "도시공학과",
          universities: ["서울시립대학교"],
          grade: "고2",
          source: "goal",
        },
      }),
    );
    renderPage();
    expect(screen.getByText("학교 정보 입력")).toBeTruthy();
    expect((screen.getByLabelText("희망 학과") as HTMLInputElement).value).toBe(
      "도시공학과",
    );
    expect(
      (screen.getByLabelText("현재 학년") as HTMLSelectElement).value,
    ).toBe("고2");
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
  });

  test("필수 칸이 비면 저장하지 않고 이유를 보여 준다", () => {
    setShell({}, makeBootstrap({ profile: null }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "학교 유형을 선택해 주세요.",
    );
  });

  test("입력을 저장하면 upsert 하고 부트스트랩을 갱신하고 토스트를 띄운다", async () => {
    saveMock.mockResolvedValue({ ok: true });
    setShell({}, makeBootstrap({ profile: null }));
    renderPage();
    fireEvent.change(screen.getByLabelText("학교 유형"), {
      target: { value: "특목,자사,영재고" },
    });
    fireEvent.change(screen.getByLabelText("고등학교 입학 연도"), {
      target: { value: "2025" },
    });
    fireEvent.change(screen.getByLabelText("현재 학년"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("학기"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("희망 대학 1"), {
      target: { value: "서울대학교" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(refetchBootstrap).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith("u1", {
      school_type: "특목,자사,영재고",
      admission_year: 2025,
      grade: "고2",
      semester: 2,
      career: null,
      department: null,
      universities: ["서울대학교"],
    });
    expect(toastMock.success).toHaveBeenCalled();
  });

  test("저장이 실패하면 오류 토스트를 띄우고 폼에 머문다", async () => {
    saveMock.mockResolvedValue({ ok: false });
    setShell({}, makeBootstrap({ profile: { ...FULL_PROFILE } }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "정보 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(refetchBootstrap).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
  });

  test("정보 수정을 누르면 같은 카드가 현재 값이 채워진 폼으로 바뀌고 취소로 돌아온다", () => {
    setShell();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "정보 수정" }));
    expect((screen.getByLabelText("희망 진로") as HTMLInputElement).value).toBe(
      "도시 데이터 분석",
    );
    expect(
      (screen.getByLabelText("희망 대학 2") as HTMLInputElement).value,
    ).toBe("건국대학교");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("button", { name: "정보 수정" })).toBeTruthy();
  });
});

describe("StartPage 새 학년도 모달", () => {
  const promo = { propose: true, next: { grade: 3, semester: 1 } };

  test("승급 제안이 있으면 모달을 열고 올리기로 학년을 갱신한 뒤 재조회한다", async () => {
    promoteMock.mockResolvedValue({ ok: true });
    setShell({}, makeBootstrap({ promotion: promo }));
    renderPage();
    expect(
      screen.getByText("새 학년도가 시작됐어요. 고3 1학기로 올릴까요?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));
    await waitFor(() => expect(refetchBootstrap).toHaveBeenCalled());
    expect(promoteMock).toHaveBeenCalledWith("u1", { grade: 3, semester: 1 });
  });

  test("이번엔 그대로를 누르면 닫히고 같은 세션에서는 다시 열리지 않는다", () => {
    setShell({}, makeBootstrap({ promotion: promo }));
    const first = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "이번엔 그대로" }));
    expect(promoteMock).not.toHaveBeenCalled();
    first.unmount();
    renderPage();
    expect(screen.queryByText(/올릴까요/)).toBeNull();
  });

  test("제안이 없으면 모달을 열지 않는다", () => {
    setShell({}, makeBootstrap({ promotion: { propose: false, next: null } }));
    renderPage();
    expect(screen.queryByText(/올릴까요/)).toBeNull();
  });

  test("승급 갱신이 실패하면 오류 토스트를 띄우고 재조회하지 않는다", async () => {
    promoteMock.mockResolvedValue({ ok: false });
    setShell({}, makeBootstrap({ promotion: promo }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(refetchBootstrap).not.toHaveBeenCalled();
  });
});
