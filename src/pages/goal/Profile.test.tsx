// 내 정보 수정(#내신·모의고사) — QA 2차 시트 행25・31・32.
// TargetUniversity.test.tsx와 같은 mock 패턴(모듈 경계 mock + 실제 QueryClient).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "./Profile";

const mockFetchGoalStudent = vi.fn();
const mockSubmitGoalIntakeUpdate = vi.fn();

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

vi.mock("@/lib/goalApi", () => ({
  fetchGoalStudent: (...args: unknown[]) => mockFetchGoalStudent(...args),
  submitGoalIntakeUpdate: (...args: unknown[]) =>
    mockSubmitGoalIntakeUpdate(...args),
}));

function baseStudent(overrides: Record<string, unknown> = {}) {
  return {
    onboarded: true,
    status: "active",
    profile: {
      name: "학생",
      schoolType: "일반고",
      grade: "고3",
      schoolCutType: "normal",
    },
    targets: {
      ideal: {
        university: "서울대",
        department: "경영학과",
        naesinCut: 1.5,
        jungsiCut: 90,
      },
      min: {
        university: "연세대",
        department: "경영학과",
        naesinCut: 2.5,
        jungsiCut: 80,
      },
    },
    scores: {
      currentScore: 2,
      convertedGrade: 2,
      currentMogo: 0,
      remainNaesin: 4,
      remainMogo: 14,
      lastNaesinExam: "고3 1학기 중간",
      lastMogoExam: "",
    },
    baseProbs: {
      idealSusi: 30,
      idealJungsi: null,
      minSusi: 60,
      minJungsi: null,
    },
    rates: {
      idealSusiBonus: 0,
      idealJungsiBonus: 0,
      minSusiBonus: 0,
      minJungsiBonus: 0,
    },
    cumulativeBonus: { idealSusi: 0, idealJungsi: 0, minSusi: 0, minJungsi: 0 },
    probs: { idealSusi: 30, idealJungsi: null, minSusi: 60, minJungsi: null },
    weeklySchedule: {},
    weekIdeal: 20,
    weekMin: 15,
    actualStartDate: "2026-09-01",
    recordCount: 0,
    lastRecordDate: null,
    jungsiAvailable: false,
    probabilityHistory: [],
    recentAvgStudyHours: null,
    targetInput: {
      ideal: { university: "서울대", department: "경영학과" },
      min: { university: "연세대", department: "경영학과" },
    },
    naesinInput: {
      lastExam: "g3_s1mid",
      scale: 9,
      overall: 2,
      exams: {},
      groupAverages: {},
    },
    mockInput: { lastRound: "", track: "", rounds: {} },
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Profile />
    </QueryClientProvider>,
  );
}

describe("Profile 내신 섹션", () => {
  beforeEach(() => {
    mockFetchGoalStudent.mockReset();
    mockSubmitGoalIntakeUpdate.mockReset();
    mockFetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: baseStudent(),
    });
  });

  it("최근 시험 요약을 읽기 전용으로 보여준다", async () => {
    renderPage();
    expect(await screen.findByText(/고3 1학기 중간/)).toBeInTheDocument();
  });

  it("내신 섹션 '수정'을 누르면 시험 선택 버튼이 나타난다", async () => {
    renderPage();

    const editButtons = await screen.findAllByRole("button", { name: "수정" });
    fireEvent.click(editButtons[0]!);

    expect(
      await screen.findByRole("button", { name: "고3 1학기 중간" }),
    ).toBeInTheDocument();
  });

  it("저장된 내신 exams가 배열 형식이어도 과목군 평균을 편집 폼에 그대로 복원한다", async () => {
    mockFetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: baseStudent({
        naesinInput: {
          lastExam: "g3_s1mid",
          scale: 9,
          overall: 2,
          exams: [
            {
              key: "g3_s1mid",
              groups: { korean: { avg: 1.5, subjects: [] } },
            },
          ],
          groupAverages: { korean: 1.5 },
        },
      }),
    });
    renderPage();

    const editButtons = await screen.findAllByRole("button", { name: "수정" });
    const naesinEditButton = editButtons[0];
    expect(naesinEditButton).toBeDefined();
    if (!naesinEditButton) throw new Error("내신 수정 버튼을 찾지 못했다");
    fireEvent.click(naesinEditButton);
    await screen.findByRole("button", { name: "고3 1학기 중간" });

    expect(await screen.findByDisplayValue("1.5")).toBeInTheDocument();
  });

  it("내신 저장을 누르면 section:'naesin'으로 서버에 저장 요청한다", async () => {
    mockSubmitGoalIntakeUpdate.mockResolvedValue({
      kind: "success",
      student: baseStudent(),
    });
    renderPage();

    const editButtons = await screen.findAllByRole("button", { name: "수정" });
    fireEvent.click(editButtons[0]!);
    await screen.findByRole("button", { name: "고3 1학기 중간" });

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockSubmitGoalIntakeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "naesin",
          naesin: expect.objectContaining({
            lastExam: "g3_s1mid",
            overall: "2",
          }),
        }),
      );
    });
  });
});

describe("Profile 모의고사 섹션", () => {
  beforeEach(() => {
    mockFetchGoalStudent.mockReset();
    mockSubmitGoalIntakeUpdate.mockReset();
    mockFetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: baseStudent(),
    });
  });

  it("모의고사 섹션 '수정'을 누르면 회차 선택 버튼이 나타난다", async () => {
    renderPage();

    const editButtons = await screen.findAllByRole("button", { name: "수정" });
    fireEvent.click(editButtons[1]!);

    expect(
      await screen.findByRole("button", { name: "고3 3모" }),
    ).toBeInTheDocument();
  });

  it("모의고사 저장을 누르면 section:'mock'으로 서버에 저장 요청한다", async () => {
    mockSubmitGoalIntakeUpdate.mockResolvedValue({
      kind: "success",
      student: baseStudent(),
    });
    renderPage();

    const editButtons = await screen.findAllByRole("button", { name: "수정" });
    fireEvent.click(editButtons[1]!);
    await screen.findByRole("button", { name: "고3 3모" });

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockSubmitGoalIntakeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "mock",
          mockExam: expect.objectContaining({ lastRound: "" }),
        }),
      );
    });
  });
});
