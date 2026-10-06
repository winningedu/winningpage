import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { TopicView } from "@/lib/inquiry/api";
import TopicCard from "./TopicCard";

function topic(over: Partial<TopicView> = {}): TopicView {
  return {
    id: "t1",
    round: 1,
    idx: 1,
    linkKind: "critique",
    linkageType: "direct",
    fit: "match",
    selected: false,
    detail: {
      title: "기준은 실제 피해와 일치하는가",
      subtitle: "폭염일수와 폐사율의 관계 분석",
      question: "실제로 그러한가?",
      hypothesis1: "폭염일수가 많을수록 폐사율이 높다",
      hypothesis2: "그렇지 않다면 다른 변수가 있다",
      verifiability: "폐사 통계가 공개되지 않아 직접 검증이 어려워요",
      concepts: ["지수", "정규화", "상관계수", "결정계수"],
      methodSteps: ["출처 확인", "통계 수집", "정규화", "상관 분석"],
      sourceCandidates: ["기상청", "농림축산식품부"],
      reason: "도구 자체를 검증 대상으로 세운 형태",
      careerLink: "지표가 측정하지 못하는 것을 아는 일",
      nextDirection: "취약도 결합 모델",
      path: {
        from: "여름철 팬팅 탐구",
        via: "앞 활동의 전제를 다시 검증한다",
        to: "실제로 그러한가?",
      },
      fitReason: null,
      followUpQuestions: [],
    },
    ...over,
  };
}

function renderCard(
  props: Partial<React.ComponentProps<typeof TopicCard>> = {},
) {
  const onSelect = vi.fn();
  render(
    <TopicCard
      topic={topic()}
      number={1}
      defaultOpen={false}
      selected={false}
      reliability="A"
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
}

describe("TopicCard", () => {
  test("번호, 배지, 제목, 부제, 가설, 검증 가능성을 그린다", () => {
    renderCard();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getAllByText("비판형").length).toBeGreaterThan(0);
    expect(screen.getByText("맞음")).toBeTruthy();
    expect(screen.getByText("기준은 실제 피해와 일치하는가")).toBeTruthy();
    expect(screen.getByText("폭염일수와 폐사율의 관계 분석")).toBeTruthy();
    expect(screen.getByText(/폭염일수가 많을수록/)).toBeTruthy();
    expect(screen.getByText(/폐사 통계가 공개되지 않아/)).toBeTruthy();
  });

  test("경로 도식은 출발 활동, 연계 유형 정의, 탐구 질문 세 칸이고 화살표 문자가 없다", () => {
    renderCard();
    const path = screen.getByRole("list", { name: "탐구 경로" });
    expect(path.textContent).toContain("출발 활동");
    expect(path.textContent).toContain("여름철 팬팅 탐구");
    expect(path.textContent).toContain("앞 활동의 전제를 다시 검증한다");
    expect(path.textContent).toContain("이번 탐구 질문");
    const hasArrow = [...(path.textContent ?? "")].some((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x2190 && code <= 0x21ff;
    });
    expect(hasArrow).toBe(false);
  });

  test("기본은 상세가 접혀 있고 자세히 보기로 연다", () => {
    renderCard();
    expect(screen.queryByText("이 주제를 고른 이유")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "자세히 보기" }));
    expect(screen.getByText("이 주제를 고른 이유")).toBeTruthy();
    expect(screen.getByText("반드시 다뤄야 할 개념")).toBeTruthy();
    expect(screen.getByText("탐구 방법 4단계")).toBeTruthy();
    expect(screen.getByText("자료와 출처 후보")).toBeTruthy();
    expect(screen.getByText("진로와의 연결")).toBeTruthy();
    expect(screen.getByText("다음 방향")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.queryByText("이 주제를 고른 이유")).toBeNull();
  });

  test("defaultOpen 이면 처음부터 펼쳐진다", () => {
    renderCard({ defaultOpen: true });
    expect(screen.getByText("이 주제를 고른 이유")).toBeTruthy();
  });

  test("이 주제로 확정을 누르면 onSelect 가 불리고, 선택되면 선택됨 표시다", () => {
    const { onSelect } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "이 주제로 확정" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("선택된 카드는 선택됨 버튼이 눌린 상태다", () => {
    renderCard({ selected: true });
    const btn = screen.getByRole("button", { name: "선택됨" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  test("fitReason 이 있으면 어긋나는 이유 줄을 그린다", () => {
    const base = topic();
    renderCard({
      topic: topic({
        fit: "off",
        detail: { ...base.detail, fitReason: "3학년에는 범위가 넓어요" },
      }),
    });
    expect(screen.getByText("어긋나는 이유")).toBeTruthy();
    expect(screen.getByText("3학년에는 범위가 넓어요")).toBeTruthy();
  });

  test("신뢰도 C 면 문장을 그리고 A 면 그리지 않는다", () => {
    renderCard({ reliability: "C" });
    expect(
      screen.getByText("입력한 주제 한 줄만으로 만든 주제예요."),
    ).toBeTruthy();
  });

  test("신뢰도 A 면 문장이 없다", () => {
    renderCard({ reliability: "A" });
    expect(screen.queryByText(/한 줄만으로 만든/)).toBeNull();
  });

  test("예비 주제 배지를 그린다", () => {
    renderCard({ topic: topic({ linkageType: "interest_based_provisional" }) });
    expect(screen.getByText("관심 기반 예비 주제, 연계 0점")).toBeTruthy();
  });
});
