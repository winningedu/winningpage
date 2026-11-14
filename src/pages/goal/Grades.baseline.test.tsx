// 설문 입력 점수가 성적 관리 회차 표에 읽기 전용 첫 행으로 보이는지 확인한다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Grades from "./Grades";

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const api = vi.hoisted(() => ({
  fetchGoalStudent: vi.fn(),
  fetchGoalGrades: vi.fn(),
  addGoalGrade: vi.fn(),
  updateGoalGrade: vi.fn(),
  deleteGoalGrade: vi.fn(),
}));
vi.mock("@/lib/goalApi", () => api);

const MOCK_INPUT = {
  lastRound: "고3_6모",
  rounds: {
    고3_6모: {
      kor: { grade: "1", pct: 96 },
      math: { grade: "2", pct: 90 },
      eng: { grade: "2" },
      tam1: { grade: "1", pct: 98 },
      tam2: { grade: "2", pct: 92 },
    },
  },
};

function student(scores: object, mockInput: object | null = MOCK_INPUT) {
  return {
    kind: "onboarded",
    student: {
      targets: { min: { naesinCut: 2.5 }, ideal: { jungsiCut: 90 } },
      scores,
      mockInput,
    },
  };
}

function renderGrades() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Grades />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tableOf = (title: RegExp) =>
  screen.getByText(title).closest("div.rounded-2xl") as HTMLElement;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("Grades 설문 입력 행", () => {
  it("회차 기록이 없어도 설문 입력 행을 내신과 모의고사 표 첫 줄에 보인다", async () => {
    api.fetchGoalStudent.mockResolvedValue(
      student({ convertedGrade: 2.4, currentMogo: 88.5 }),
    );
    api.fetchGoalGrades.mockResolvedValue({
      kind: "ok",
      naesinRecords: [],
      mockRecords: [],
    });
    renderGrades();

    const naesin = await screen.findByText(/회차별 등급/);
    const naesinRows = within(naesin.closest("div.rounded-2xl") as HTMLElement)
      .getAllByRole("row")
      .slice(1);
    expect(naesinRows).toHaveLength(1);
    expect(naesinRows[0]).toHaveTextContent("설문 입력");
    expect(naesinRows[0]).toHaveTextContent("2.4");

    const mockRows = within(tableOf(/회차별 백분위/))
      .getAllByRole("row")
      .slice(1);
    expect(mockRows).toHaveLength(1);
    const cells = within(mockRows[0] as HTMLElement)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["설문 입력", "96", "90", "", "95", "88.5"]);
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });

  it("설문 점수가 없으면 표는 지금과 같다", async () => {
    api.fetchGoalStudent.mockResolvedValue(
      student({ convertedGrade: null, currentMogo: null }, null),
    );
    api.fetchGoalGrades.mockResolvedValue({
      kind: "ok",
      naesinRecords: [],
      mockRecords: [],
    });
    renderGrades();

    await screen.findAllByText(
      "아직 등록된 회차가 없습니다. 첫 회차를 추가해보세요.",
    );
    expect(screen.queryByText("설문 입력")).toBeNull();
  });
});
