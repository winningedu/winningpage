import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SURVEY_QUESTIONS } from "../../../api/_lib/growth/intake/survey.js";

const { saveSurveyMock, shell, searchDepartmentsMock } = vi.hoisted(() => ({
  saveSurveyMock: vi.fn(),
  shell: { current: {} as Record<string, unknown> },
  searchDepartmentsMock: vi.fn(),
}));

vi.mock("@/lib/growth/api", () => ({ saveSurvey: saveSurveyMock }));
vi.mock("@/components/growth/survey/surveySearch", async (orig) => ({
  ...(await orig<typeof import("@/components/growth/survey/surveySearch")>()),
  searchDepartments: searchDepartmentsMock,
  searchUniversities: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthScreenStep: vi.fn(),
  useGrowthShell: () => shell.current,
}));

import SurveyPage from "./SurveyPage";

function bootstrap(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    questions: SURVEY_QUESTIONS,
    openReport: null,
    prefill: {
      survey: null,
      autoFilled: { favoriteSubjects: [], books: [] },
      previousAnswers: null,
    },
    ...over,
  };
}

function setShell(b: Record<string, unknown> | null) {
  shell.current = {
    bootstrap: b,
    bootstrapError: null,
    refetchBootstrap: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/growth/survey"]}>
      <Routes>
        <Route path="/app/growth/survey" element={<SurveyPage />} />
        <Route path="/app/growth/collect" element={<p>활동 선택 화면</p>} />
        <Route path="/app/growth" element={<p>시작 화면</p>} />
        <Route path="/app/growth/generate" element={<p>생성 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SurveyPage", () => {
  beforeEach(() => {
    saveSurveyMock.mockReset();
    searchDepartmentsMock.mockReset();
  });

  test("5개 그룹과 24문항, 진행 문구를 그린다", async () => {
    setShell(bootstrap());
    renderPage();
    expect(await screen.findByText("24문항 중 0문항 답함")).toBeTruthy();
    expect(screen.getByText("최근에 있었던 일 (4문항)")).toBeTruthy();
    expect(screen.getByText("진로와 관심 (7문항)")).toBeTruthy();
    expect(screen.getByText("해본 것과 하고 싶은 것 (5문항)")).toBeTruthy();
    expect(screen.getByText("함께한 경험 (4문항)")).toBeTruthy();
    expect(screen.getByText("지금의 나와 여건 (4문항)")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(24);
  });

  test("재진입하면 저장된 답을 복원하고 이어서 답할 번호를 안내한다", async () => {
    setShell(
      bootstrap({
        openReport: {
          id: "r1",
          currentStep: 0,
          answers: {
            q1: "공공데이터 포털에서 버스 정류장 자료를 찾았다",
            q2: "x",
          },
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("24문항 중 2문항 답함")).toBeTruthy();
    expect(screen.getByText("지난번에 답한 2문항을 불러왔어요")).toBeTruthy();
    expect(screen.getByText(/3번부터 이어서 답하면 돼요/)).toBeTruthy();
  });

  test("프리필 문항에는 출처 배지를 달고, 고치면 배지가 사라진다", async () => {
    setShell(
      bootstrap({
        prefill: {
          survey: { filledFrom: "diagnosis", q5: "정해짐" },
          autoFilled: { favoriteSubjects: [], books: [] },
          previousAnswers: null,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("무료진단에서 가져옴")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "고민 중" }));
    expect(screen.queryByText("무료진단에서 가져옴")).toBeNull();
  });

  test("서술이 10자 미만이면 안내를 띄우되 막지는 않는다", async () => {
    setShell(bootstrap());
    renderPage();
    const box = await screen.findByLabelText(/1\. 새로운 내용을 배울 때/);
    fireEvent.change(box, { target: { value: "책 읽음" } });
    expect(
      screen.getByText("조금 더 자세히 적으면 분석이 정확해져요"),
    ).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("책 읽음");
  });

  test("학과 검색 결과가 없으면 직접 입력으로 추가할 수 있다", async () => {
    setShell(bootstrap());
    searchDepartmentsMock.mockResolvedValue([]);
    renderPage();
    const input = await screen.findByRole("combobox", {
      name: /10\. 희망 학과/,
    });
    fireEvent.change(input, { target: { value: "도시데이터융합학과" } });
    const add = await screen.findByRole(
      "button",
      { name: "직접 적은 학과로 추가" },
      { timeout: 2000 },
    );
    expect(
      screen.getByText(
        "직접 적은 학과는 반영과목 자동 대조가 제한될 수 있어요.",
      ),
    ).toBeTruthy();
    fireEvent.click(add);
    expect(await screen.findByText("도시데이터융합학과")).toBeTruthy();
    expect(screen.getByText("24문항 중 1문항 답함")).toBeTruthy();
  });

  test("비어 있는 문항이 있으면 확인 다이얼로그를 한 번 거친다", async () => {
    setShell(bootstrap());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "활동 선택으로" }),
    );
    expect(
      await screen.findByText("24문항이 비어 있어요. 그래도 넘어갈까요?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "넘어가기" }));
    expect(await screen.findByText("활동 선택 화면")).toBeTruthy();
  });

  test("저장이 실패하면 활동 선택으로 넘어가지 않는다", async () => {
    setShell(bootstrap());
    saveSurveyMock.mockResolvedValue({ kind: "timeout" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "정해짐" }));
    fireEvent.click(screen.getByRole("button", { name: "활동 선택으로" }));
    fireEvent.click(await screen.findByRole("button", { name: "넘어가기" }));
    await waitFor(() => expect(saveSurveyMock).toHaveBeenCalled());
    expect(screen.queryByText("활동 선택 화면")).toBeNull();
    expect(await screen.findByText("저장 실패, 다시 시도")).toBeTruthy();
  });

  test("리포트 생성이 시작된 회차는 입력을 잠그고 안내한다", async () => {
    setShell(
      bootstrap({
        openReport: { id: "r1", currentStep: 2, answers: { q1: "답" } },
      }),
    );
    renderPage();
    expect(
      await screen.findByText(
        "리포트 생성이 시작된 회차는 설문을 바꿀 수 없어요",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          /1\. 새로운 내용을 배울 때/,
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("link", { name: "리포트 생성으로" })).toBeTruthy();
  });
});
