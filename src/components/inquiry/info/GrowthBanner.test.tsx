import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import type { HandoffView } from "@/lib/inquiry/types";
import GrowthBanner from "./GrowthBanner";

const HANDOFF: HandoffView = {
  reportId: "g1",
  issuedAt: "2026-09-14T03:00:00Z",
  theme: "직접 검증하는 사람으로",
  subthemes: [{ grade: "고2", stage: "flower", text: "과목에서 진로로" }],
  stage: "flower",
  weakAxes: [],
  signals: null,
  planItems: [
    {
      id: "p1",
      title: "생명과학 탐구",
      description: null,
      category: null,
      axis: null,
    },
    {
      id: "p2",
      title: "화학 탐구",
      description: null,
      category: null,
      axis: null,
    },
  ],
  stale: false,
  stageMismatch: false,
  autoSelectedPlanItemId: "p1",
};

function setup(
  handoff: HandoffView | null,
  selected: string | null = "p1",
  onSelect = vi.fn(),
) {
  render(
    <MemoryRouter>
      <GrowthBanner
        handoff={handoff}
        selectedPlanItemId={selected}
        disabled={false}
        onSelectPlanItem={onSelect}
      />
    </MemoryRouter>,
  );
  return onSelect;
}

describe("GrowthBanner", () => {
  test("연동 값이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <MemoryRouter>
        <GrowthBanner
          handoff={null}
          selectedPlanItemId={null}
          disabled={false}
          onSelectPlanItem={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("대주제, 단계, 소주제, 발행일을 보여 준다", () => {
    setup(HANDOFF);
    expect(screen.getByText("직접 검증하는 사람으로")).toBeVisible();
    expect(screen.getByText("고2 과목에서 진로로")).toBeVisible();
    expect(screen.getByText(/2026\.09\.14/)).toBeVisible();
    expect(screen.getByText("꽃")).toBeVisible();
  });

  test("과제 후보를 라디오로 보여 주고 선택값을 표시한다", () => {
    setup(HANDOFF, "p1");
    expect(screen.getByRole("radio", { name: "생명과학 탐구" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "화학 탐구" })).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "과제 없이 진행" }),
    ).not.toBeChecked();
  });

  test("다른 과제나 과제 없이 진행을 고르면 알린다", () => {
    const onSelect = setup(HANDOFF, "p1");
    fireEvent.click(screen.getByRole("radio", { name: "화학 탐구" }));
    expect(onSelect).toHaveBeenCalledWith("p2");
    fireEvent.click(screen.getByRole("radio", { name: "과제 없이 진행" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test("후보가 없으면 과제 선택을 그리지 않는다", () => {
    setup({ ...HANDOFF, planItems: [], autoSelectedPlanItemId: null }, null);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  test("오래됨, 단계 불일치 안내를 보여 주고 성장설계로 가는 링크를 둔다", () => {
    setup({ ...HANDOFF, stale: true, stageMismatch: true });
    expect(screen.getByText(/발행한 지 오래됐어요/)).toBeVisible();
    expect(
      screen.getByText(/학년 단계와 이번 세션의 학년이 달라요/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "성장설계 보러 가기" }),
    ).toHaveAttribute("href", "/app/growth");
  });
});
