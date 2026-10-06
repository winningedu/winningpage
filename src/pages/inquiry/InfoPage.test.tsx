import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SessionResponse, SessionView } from "@/lib/inquiry/types";

const h = vi.hoisted(() => ({
  shell: {} as Record<string, unknown>,
  stepMock: vi.fn(),
  postSession: vi.fn(),
  postAssets: vi.fn(),
  upsert: vi.fn(),
  navigate: vi.fn(),
  applyBootstrap: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryShell: () => h.shell,
  useInquiryScreenStep: h.stepMock,
}));
vi.mock("@/lib/inquiry/api", () => ({
  postSession: h.postSession,
  postAssets: h.postAssets,
}));
vi.mock("@/lib/inquiry/profile", () => ({
  upsertStudentProfile: h.upsert,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => h.navigate,
}));

import InfoPage from "./InfoPage";

const QUOTA = {
  quotaTotal: 10,
  quotaUsed: 3,
  quotaRemaining: 7,
  planEndsAt: null,
  planLabel: null,
};

function bootstrap(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    ok: true,
    session: null,
    profile: { gradeLabel: "고2", semester: 2, career: "수의예과" },
    quota: QUOTA,
    handoff: null,
    records: [],
    subjectCounts: [],
    assets: [],
    topics: [],
    gradeNote: null,
    replyResent: false,
    ...overrides,
  };
}

function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    status: "draft",
    currentStep: 1,
    gradeLabel: "고2",
    semester: 2,
    career: "수의예과",
    subject: "생명과학",
    designReportId: null,
    planItemId: null,
    ...overrides,
  } as SessionView;
}

function setShell(
  data: SessionResponse | null,
  extra: Record<string, unknown> = {},
) {
  h.shell = {
    bootstrap: data,
    session: data?.session ?? null,
    quota: data?.quota ?? null,
    handoff: data?.handoff ?? null,
    records: data?.records ?? [],
    subjectCounts: data?.subjectCounts ?? [],
    assets: data?.assets ?? [],
    gradeNote: data?.gradeNote ?? null,
    isBootstrapLoading: false,
    bootstrapError: null,
    applyBootstrap: h.applyBootstrap,
    refetchBootstrap: h.refetch,
    ...extra,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InfoPage />
    </MemoryRouter>,
  );
}

function fill(subject = "생명과학") {
  fireEvent.change(screen.getByLabelText(/과목명/), {
    target: { value: subject },
  });
}

function addOneline(text = "여름철 산책 판단") {
  fireEvent.change(screen.getByLabelText("했던 활동의 주제 한 줄"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
}

const SUBMIT = () => screen.getByRole("button", { name: "주제 3개 추천받기" });

beforeEach(() => {
  for (const mock of [
    h.stepMock,
    h.postSession,
    h.postAssets,
    h.upsert,
    h.navigate,
    h.applyBootstrap,
    h.refetch,
  ]) {
    mock.mockReset();
  }
  setShell(bootstrap());
  h.upsert.mockResolvedValue({ ok: true });
  h.postSession.mockResolvedValue({
    kind: "ok",
    data: bootstrap({ session: session() }),
  });
  h.postAssets.mockResolvedValue({
    kind: "ok",
    data: { ok: true, assets: [], warnings: [], planItemId: null },
  });
});

describe("InfoPage 화면 상태", () => {
  test("1단계를 셸에 알리고 제목을 그린다", () => {
    renderPage();
    expect(h.stepMock).toHaveBeenCalledWith(1);
    expect(
      screen.getByRole("heading", { name: "무엇을 이어서 파고들까요" }),
    ).toBeVisible();
  });

  test("부트스트랩 로딩 중에는 로딩 표시를 그린다", () => {
    setShell(null, { isBootstrapLoading: true });
    renderPage();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeVisible();
    expect(SUBMIT).toThrow();
  });

  test("부트스트랩 오류는 안내와 다시 시도 버튼을 그린다", () => {
    setShell(null, {
      bootstrapError: {
        result: { kind: "error", status: 500, code: "INTERNAL", message: "x" },
      },
    });
    renderPage();
    expect(screen.getByText("정보를 불러오지 못했어요.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(h.refetch).toHaveBeenCalled();
  });

  test("프로필 값으로 폼이 채워진다", () => {
    renderPage();
    expect(screen.getByRole("radio", { name: "고2" })).toBeChecked();
    expect(screen.getByLabelText(/희망 진로/)).toHaveValue("수의예과");
    expect(screen.getByLabelText(/과목명/)).toHaveValue("");
  });

  test("열린 세션이 있으면 세션 값과 저장된 자산이 복원된다", () => {
    setShell(
      bootstrap({
        session: session({ subject: "화학", career: "교사" }),
        assets: [
          {
            id: "a1",
            kind: "oneline",
            reliability: "C",
            position: 0,
            activityRecordId: null,
            interviewAnswers: null,
            gaps: [],
            onelineText: "복원된 한 줄",
            summary: "복원된 한 줄",
          },
        ],
      }),
    );
    renderPage();
    expect(screen.getByLabelText(/과목명/)).toHaveValue("화학");
    expect(screen.getByLabelText(/희망 진로/)).toHaveValue("교사");
    expect(screen.getByText("복원된 한 줄")).toBeVisible();
    expect(screen.getByText("출발 활동")).toBeVisible();
  });

  test("확정된 세션이면 안내와 보관함 링크를 보여 주고 새 세션을 시작할 수 있다", () => {
    setShell(bootstrap({ session: session({ status: "completed" }) }));
    renderPage();
    expect(screen.getByText("이 세션은 확정됐어요")).toBeVisible();
    expect(screen.getByRole("link", { name: "보관함 보기" })).toHaveAttribute(
      "href",
      "/app/inquiry/reports",
    );
    fireEvent.click(screen.getByRole("button", { name: "새 세션 시작하기" }));
    expect(SUBMIT()).toBeVisible();
  });

  test("설계 리포트가 있는 세션은 잠겨 있다", () => {
    setShell(bootstrap({ session: session({ designReportId: "d1" }) }));
    renderPage();
    expect(
      screen.getByText(
        /설계 리포트를 만든 뒤에는 출발 활동과 정보를 바꿀 수 없어요/,
      ),
    ).toBeVisible();
    expect(SUBMIT()).toBeDisabled();
  });
});

describe("InfoPage 제출", () => {
  test("과목명이 비어 있으면 필드 아래에 안내하고 서버를 부르지 않는다", () => {
    renderPage();
    addOneline();
    fireEvent.click(SUBMIT());
    expect(screen.getByText("과목명을 적어 주세요.")).toBeVisible();
    expect(h.postSession).not.toHaveBeenCalled();
  });

  test("활동이 0건이면 확인 창을 띄우고 활동 고르러 가기는 닫기만 한다", () => {
    renderPage();
    fill();
    fireEvent.click(SUBMIT());
    expect(
      screen.getByRole("dialog", { name: "고른 활동이 없어요" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "활동 고르러 가기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.postSession).not.toHaveBeenCalled();
  });

  test("정상 제출은 프로필 저장, create, 자산 저장, 이동 순서로 진행한다", async () => {
    renderPage();
    fill();
    addOneline("여름철 산책 판단");
    fireEvent.click(SUBMIT());
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());

    expect(h.upsert).toHaveBeenCalledWith("u1", {
      gradeLabel: "고2",
      semester: 2,
      career: "수의예과",
    });
    expect(h.postSession).toHaveBeenCalledWith({
      action: "create",
      info: {
        gradeLabel: "고2",
        semester: 2,
        career: "수의예과",
        subject: "생명과학",
      },
    });
    expect(h.postAssets).toHaveBeenCalledWith({
      sessionId: "s1",
      items: [{ kind: "oneline", text: "여름철 산책 판단" }],
      planItemId: null,
    });
    expect(h.applyBootstrap).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith("/app/inquiry/topics", {
      state: { startRecommend: true },
    });
  });

  test("활동 0건 확인 뒤 예비 주제로 추천받기를 누르면 빈 자산으로 진행한다", async () => {
    renderPage();
    fill();
    fireEvent.click(SUBMIT());
    fireEvent.click(
      screen.getByRole("button", { name: "예비 주제로 추천받기" }),
    );
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    expect(h.postAssets).toHaveBeenCalledWith({
      sessionId: "s1",
      items: [],
      planItemId: null,
    });
  });

  test("세션 정보가 그대로면 create 를 부르지 않는다", async () => {
    setShell(bootstrap({ session: session() }));
    renderPage();
    addOneline();
    fireEvent.click(SUBMIT());
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    expect(h.postSession).not.toHaveBeenCalled();
    expect(h.postAssets).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s1" }),
    );
  });

  test("429 QUOTA_EXHAUSTED 는 이용 횟수 소진 카드와 이용권 보기 링크를 보여 준다", async () => {
    h.postSession.mockResolvedValue({
      kind: "error",
      status: 429,
      code: "QUOTA_EXHAUSTED",
      message: "x",
    });
    renderPage();
    fill();
    addOneline();
    fireEvent.click(SUBMIT());
    expect(await screen.findByText("이용 횟수를 모두 썼어요")).toBeVisible();
    expect(screen.getByRole("link", { name: "이용권 보기" })).toHaveAttribute(
      "href",
      "/pricing?service=inquiry",
    );
    expect(h.navigate).not.toHaveBeenCalled();
  });

  test("409 SESSION_LOCKED 는 잠김 안내를 보여 준다", async () => {
    h.postSession.mockResolvedValue({
      kind: "ok",
      data: bootstrap({ session: session() }),
    });
    h.postAssets.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "SESSION_LOCKED",
      message: "x",
    });
    renderPage();
    fill();
    addOneline();
    fireEvent.click(SUBMIT());
    expect(
      await screen.findByText(
        "설계 리포트를 만든 뒤에는 출발 활동과 정보를 바꿀 수 없어요. 새 세션은 확정 뒤에 시작할 수 있어요",
      ),
    ).toBeVisible();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  test("서버 오류는 안내 문구를 보여 주고 이동하지 않는다", async () => {
    h.postSession.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    fill();
    addOneline();
    fireEvent.click(SUBMIT());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "요청을 처리하지 못했어요",
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(SUBMIT()).toBeEnabled();
  });
});

describe("InfoPage 부가 표시", () => {
  test("gradeNote 가 있으면 기본 정보 카드 아래에 안내한다", () => {
    setShell(bootstrap({ gradeNote: "1학년은 후속형과 전이형을 권장해요." }));
    renderPage();
    expect(
      screen.getByText("1학년은 후속형과 전이형을 권장해요."),
    ).toBeVisible();
  });

  test("잔여 회차 카드와 연계 규칙 카드를 그린다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "이용 횟수" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "연계 규칙" })).toBeVisible();
  });
});
