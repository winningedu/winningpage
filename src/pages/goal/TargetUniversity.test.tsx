// 내 목표 대학(#24) 편집 UI — QA 2차 시트 행25・31・32.
// Onboarding.test.tsx와 같은 패턴(모듈 경계에서 mock, 실제 QueryClient로 렌더)을 쓴다.
// UniversitySelect 내부의 실검색(supabase)은 이 화면 책임이 아니므로
// universitySearch 모듈을 통째로 mock해 네트워크 없이 렌더만 검증한다.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TargetUniversity from "./TargetUniversity";

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

vi.mock("@/lib/goal/universitySearch", () => ({
  searchUniversities: vi.fn().mockResolvedValue([]),
  fetchDepartmentsForUniversity: vi.fn().mockResolvedValue([]),
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
        jungsinCut: 90,
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
      currentMogo: 85,
      remainNaesin: 4,
      remainMogo: 4,
      lastNaesinExam: "고3 1학기 중간",
      lastMogoExam: "고3 6모",
    },
    baseProbs: { idealSusi: 30, idealJungsi: 20, minSusi: 60, minJungsi: 50 },
    rates: {
      idealSusiBonus: 0,
      idealJungsiBonus: 0,
      minSusiBonus: 0,
      minJungsiBonus: 0,
    },
    cumulativeBonus: { idealSusi: 0, idealJungsi: 0, minSusi: 0, minJungsi: 0 },
    probs: { idealSusi: 30, idealJungsi: 20, minSusi: 60, minJungsi: 50 },
    weeklySchedule: {},
    weekIdeal: 20,
    weekMin: 15,
    actualStartDate: "2026-09-01",
    recordCount: 0,
    lastRecordDate: null,
    jungsiAvailable: true,
    probabilityHistory: [],
    recentAvgStudyHours: null,
    targetInput: {
      ideal: { university: "서울대", department: "경영학과" },
      min: { university: "연세대", department: "경영학과" },
    },
    naesinInput: null,
    mockInput: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TargetUniversity />
    </QueryClientProvider>,
  );
}

describe("TargetUniversity 편집", () => {
  beforeEach(() => {
    mockFetchGoalStudent.mockReset();
    mockSubmitGoalIntakeUpdate.mockReset();
    mockFetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: baseStudent(),
    });
  });

  it("'변경' 버튼을 누르면 대학 선택 필드 2개(이상/최소)가 나타난다", async () => {
    renderPage();

    const changeButton = await screen.findByRole("button", { name: "변경" });
    fireEvent.click(changeButton);

    // UniversitySelect 1개당 대학명 콤보박스(input) 1개 — 이상/최소 2개가 떠야 한다.
    const universityInputs = screen.getAllByPlaceholderText(
      "대학교를 선택해주세요",
    );
    expect(universityInputs).toHaveLength(2);
  });

  it("저장을 누르면 확인 다이얼로그에 정확한 안내 문구가 뜬다", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "변경" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "목표대학을 변경하면 기존의 학습 data 반영이 새롭게 적용됩니다.",
      ),
    ).toBeInTheDocument();
  });

  it("다이얼로그에서 확정하면 section:'target'으로 서버에 저장 요청한다", async () => {
    mockSubmitGoalIntakeUpdate.mockResolvedValue({
      kind: "success",
      student: baseStudent(),
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "변경" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText(
      "목표대학을 변경하면 기존의 학습 data 반영이 새롭게 적용됩니다.",
    );

    // 편집 폼의 "변경" 토글 버튼은 편집 모드 진입과 동시에 숨겨지므로, 지금 화면에 남은
    // "변경" 버튼은 확인 다이얼로그의 확정 버튼 하나뿐이다.
    fireEvent.click(screen.getByRole("button", { name: "변경" }));

    await waitFor(() => {
      expect(mockSubmitGoalIntakeUpdate).toHaveBeenCalledWith({
        section: "target",
        upperUniversity: { university: "서울대", department: "경영학과" },
        lowerUniversity: { university: "연세대", department: "경영학과" },
      });
    });
  });
});
