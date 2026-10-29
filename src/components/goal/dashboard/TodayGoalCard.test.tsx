import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import TodayGoalCard from "./TodayGoalCard";

const data = {
  studyHours: 2,
  quickAddOptions: [0.5, 1],
  upperGoalRate: 40,
  lowerGoalRate: 80,
  upperTargetHours: 5,
  lowerTargetHours: 2.5,
  cooldown: null,
  summary: null,
  tomorrowTargets: { upper: 0, lower: 0 },
};

// 모바일(390px)에서 고정 폭 합이 카드 폭을 넘어 달성률 행이 잘리던 문제.
// md 미만은 두 줄(점+라벨+퍼센트 / 진행바+시간), md 이상은 한 줄.
describe("TodayGoalCard 달성률 행 반응형 레이아웃", () => {
  test("행 루트는 모바일에서 줄바꿈하고 md 이상에서 한 줄을 유지한다", () => {
    render(<TodayGoalCard data={data as never} />);

    const row = screen.getByText("이상 목표 학습 시간").parentElement;
    expect(row).toHaveClass("flex-wrap", "md:flex-nowrap");
  });

  test("진행바 래퍼는 모바일에서 한 줄 전체 폭을 차지하고 시간 표기를 함께 담는다", () => {
    render(<TodayGoalCard data={data as never} />);

    const hours = screen.getByText("2.0h / 5.0h");
    expect(hours.parentElement).toHaveClass("basis-full", "md:basis-auto");
  });

  test("카드 루트의 고정 높이는 md 이상에서만 적용한다", () => {
    const { container } = render(<TodayGoalCard data={data as never} />);

    const card = container.firstElementChild;
    expect(card).toHaveClass("md:h-102.25");
    expect(card).not.toHaveClass("h-102.25");
  });
});
