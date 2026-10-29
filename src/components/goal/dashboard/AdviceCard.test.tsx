import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdviceCard from "./AdviceCard";

// QA 행295·306 — AdviceCard는 GET /api/goal/advice의 오늘 섹션(sections[0])+majorTips만
// 그린다. "내일 계획 제시" 섹션은 TomorrowPlanCard 소유다(TomorrowPlanCard.test.tsx,
// 텍스트 중복 제거 후속 지시 2026-09-02). origin(ai/rule) 자체는 이 카드가 아니라
// DashboardPageHeader의 뱃지가 표시한다(DashboardPageHeader.test.tsx).
describe("AdviceCard", () => {
  test("data가 null이면(조언이 한 번도 없음) 제목과 빈 상태 문구만 렌더한다", () => {
    render(<AdviceCard data={null} />);

    expect(screen.getByText("오늘의 조언")).toBeInTheDocument();
    expect(
      screen.getByText("오늘의 공부 기록을 남기면 조언이 생성돼요"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\[.*\]/)).not.toBeInTheDocument();
  });

  describe("생성일 라벨(QA 행70)", () => {
    afterEach(() => vi.useRealTimers());

    const data = {
      section: { label: "[오늘의 조언]", body: "본문" },
      majorTips: [],
    };

    test("조언이 오늘(KST) 것이 아니면 날짜 라벨을 보여준다", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-29T03:00:00+09:00"));
      render(<AdviceCard data={data} generatedFor="2026-10-28" />);

      expect(screen.getByText("10월 28일 조언")).toBeInTheDocument();
    });

    test("오늘 조언이면 날짜 라벨이 없다", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-29T03:00:00+09:00"));
      render(<AdviceCard data={data} generatedFor="2026-10-29" />);

      expect(screen.queryByText(/월 \d+일 조언/)).not.toBeInTheDocument();
    });
  });

  test("오늘 섹션을 라벨 소제목 + 본문으로 렌더한다", () => {
    render(
      <AdviceCard
        data={{
          section: { label: "[오늘의 조언]", body: "오늘도 잘했어요" },
          majorTips: [],
        }}
      />,
    );

    expect(screen.getByText("[오늘의 조언]")).toBeInTheDocument();
    expect(screen.getByText("오늘도 잘했어요")).toBeInTheDocument();
  });

  test("내일 계획 섹션은 그리지 않는다(TomorrowPlanCard 소유)", () => {
    render(
      <AdviceCard
        data={{
          section: { label: "[AI 입시조언]", body: "본문" },
          majorTips: [],
        }}
      />,
    );

    expect(screen.queryByText("[내일 계획 제시]")).not.toBeInTheDocument();
    expect(screen.queryByText("[다음 계획 제시]")).not.toBeInTheDocument();
  });

  test("majorTips가 있으면 학과명 소제목과 함께 렌더하고, 없으면 렌더하지 않는다", () => {
    const { rerender } = render(
      <AdviceCard
        data={{
          section: { label: "[오늘의 조언]", body: "본문" },
          majorTips: [
            { department: "서울대 컴퓨터공학과", text: "핵심 과목 안내" },
          ],
        }}
      />,
    );

    expect(screen.getByText("[서울대 컴퓨터공학과]")).toBeInTheDocument();
    expect(screen.getByText("핵심 과목 안내")).toBeInTheDocument();

    rerender(
      <AdviceCard
        data={{
          section: { label: "[오늘의 조언]", body: "본문" },
          majorTips: [],
        }}
      />,
    );
    expect(screen.queryByText("[서울대 컴퓨터공학과]")).not.toBeInTheDocument();
  });
});
