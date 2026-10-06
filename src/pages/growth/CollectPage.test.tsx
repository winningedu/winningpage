import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectSummary: vi.fn(),
  collectCommit: vi.fn(),
  navigate: vi.fn(),
  refetchBootstrap: vi.fn(),
  shell: {} as Record<string, unknown>,
}));

vi.mock("@/lib/growth/api", () => ({
  collectSummary: mocks.collectSummary,
  collectCommit: mocks.collectCommit,
  collectUploadUrl: vi.fn(),
  collectExtract: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), storage: {} } }));
vi.mock("react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthScreenStep: vi.fn(),
  useGrowthShell: () => mocks.shell,
}));

import CollectPage from "./CollectPage";

const sourceCounts = (total: number) => ({
  performance: total,
  self: 0,
  deep: 0,
  manual: 0,
  upload: 0,
  total,
});

const summary = (over: Record<string, unknown> = {}) => ({
  range: {
    semesters: ["고1-1", "고1-2"],
    description: "1학년 전체와 2학년 현재까지가 분석 범위예요.",
  },
  omitted: { ids: [], reasons: [] },
  bySource: sourceCounts(2),
  byGroup: { curricular: 0, extracurricular: 0, unclassified: 0 },
  semesters: [
    {
      key: "고1-1",
      count: 2,
      sufficiency: "insufficient",
      label: "부족",
      notice: null,
    },
    {
      key: "고1-2",
      count: 0,
      sufficiency: "none",
      label: "없음",
      notice: "자료 없음, 업로드 권장",
    },
  ],
  firstYear: { count: 2, level: "insufficient", label: "부족" },
  uploadsPending: 0,
  uploads: [],
  uploadQuotaBySemester: { "고1-1": 10, "고1-2": 10 },
  analysisActivityIds: [],
  gradeInputs: {
    system: "five",
    semesters: [{ key: "고1-1", average: 2.9, source: "goal" }],
    note: null,
  },
  monthlyPlan: false,
  warnings: [],
  ...over,
});

function ready(over: Record<string, unknown> = {}) {
  mocks.collectSummary.mockResolvedValue({
    kind: "ok",
    data: { ok: true, reportId: "r1", summary: summary(over), activities: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refetchBootstrap.mockResolvedValue(undefined);
  mocks.shell = {
    bootstrap: {
      profile: { grade: "고2", semester: 1, admission_year: 2025 },
      profileInitial: null,
    },
    openReport: { id: "r1" },
    isBootstrapLoading: false,
    refetchBootstrap: mocks.refetchBootstrap,
  };
});

describe("CollectPage", () => {
  test("열린 회차가 없으면 학생 조사로 가는 버튼만 보인다", () => {
    mocks.shell = { ...mocks.shell, openReport: null };
    render(<CollectPage />);
    fireEvent.click(screen.getByRole("button", { name: "학생 조사로 가기" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/app/growth/survey");
    expect(mocks.collectSummary).not.toHaveBeenCalled();
  });

  test("프로필 학년으로 트랙을 고르고 서버 범위 설명과 집계를 보여 준다", async () => {
    ready();
    render(<CollectPage />);
    expect(
      await screen.findByText(
        "고2를 골랐어요. 1학년 전체와 2학년 현재까지가 분석 범위예요.",
      ),
    ).toBeTruthy();
    expect(mocks.collectSummary).toHaveBeenCalledWith({
      track: "고2",
      current: { grade: 2, semester: 1 },
      directGrades: {},
    });
    expect(screen.getByText("자료 없음, 업로드 권장")).toBeTruthy();
    expect(screen.getByText("1학년 2학기 자료 추가")).toBeTruthy();
  });

  test("성적 칸은 서버 평균을 채우고 범위 밖 값은 오류를 보인다", async () => {
    ready();
    render(<CollectPage />);
    const input = (await screen.findByLabelText(
      "1학년 1학기",
    )) as HTMLInputElement;
    expect(input.value).toBe("2.9");
    fireEvent.change(input, { target: { value: "7" } });
    expect(screen.getByText("1부터 5까지 적어 주세요.")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "리포트 만들기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("처리 중인 업로드가 있으면 리포트 만들기가 막힌다", async () => {
    ready({
      uploadsPending: 1,
      uploads: [
        {
          id: "u1",
          fileName: "a.pdf",
          gradeLabel: "고1",
          semester: 2,
          status: "processing",
        },
      ],
    });
    render(<CollectPage />);
    await screen.findByText("저장된 활동");
    expect(
      (
        screen.getByRole("button", {
          name: "리포트 만들기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getAllByText("아직 처리 중인 파일이 있어요").length,
    ).toBeGreaterThan(0);
  });

  test("1학년 자료가 충분하면 1학년 자료 없이 진행 버튼이 없다", async () => {
    ready({ firstYear: { count: 9, level: "enough", label: "있음" } });
    render(<CollectPage />);
    await screen.findByText("저장된 활동");
    expect(
      screen.queryByRole("button", { name: "1학년 자료 없이 진행" }),
    ).toBeNull();
  });

  test("1학년 자료 없이 진행은 확인 다이얼로그 뒤에 커밋한다", async () => {
    ready();
    mocks.collectCommit.mockResolvedValue({
      kind: "ok",
      data: { ok: true, reportId: "r1", summary: summary(), committed: true },
    });
    render(<CollectPage />);
    await screen.findByText("저장된 활동");
    fireEvent.click(
      screen.getByRole("button", { name: "1학년 자료 없이 진행" }),
    );
    expect(
      await screen.findByText(/1학년 평가 항목은 자료 없음으로 나와요/),
    ).toBeTruthy();
    expect(mocks.collectCommit).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button", { name: "리포트 만들기" });
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    await waitFor(() => expect(mocks.collectCommit).toHaveBeenCalled());
  });

  test("커밋 성공이면 부트스트랩을 갱신하고 생성 화면으로 간다", async () => {
    ready();
    mocks.collectCommit.mockResolvedValue({
      kind: "ok",
      data: { ok: true, reportId: "r1", summary: summary(), committed: true },
    });
    render(<CollectPage />);
    await screen.findByText("저장된 활동");
    fireEvent.click(screen.getByRole("button", { name: "리포트 만들기" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith("/app/growth/generate"),
    );
    expect(mocks.refetchBootstrap).toHaveBeenCalled();
    expect(mocks.collectCommit).toHaveBeenCalledWith({
      track: "고2",
      current: { grade: 2, semester: 1 },
      directGrades: {},
    });
  });

  test("REPORT_LOCKED 면 생성 화면으로 이동을 제안한다", async () => {
    ready();
    mocks.collectCommit.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "REPORT_LOCKED",
      message: "잠김",
    });
    render(<CollectPage />);
    await screen.findByText("저장된 활동");
    fireEvent.click(screen.getByRole("button", { name: "리포트 만들기" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "생성 화면으로 이동" }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith("/app/growth/generate");
  });
});
