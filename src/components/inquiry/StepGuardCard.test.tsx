import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import StepGuardCard from "./StepGuardCard";

function renderCard() {
  return render(
    <MemoryRouter>
      <StepGuardCard
        title="아직 설계 리포트가 없어요"
        description="주제 추천에서 주제를 하나 고르면 여기에 8절 설계가 나와요."
        backLabel="주제 추천으로 돌아가기"
        backTo="/app/inquiry/topics"
      />
    </MemoryRouter>,
  );
}

describe("StepGuardCard", () => {
  test("제목과 설명을 그린다", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { name: "아직 설계 리포트가 없어요" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/주제 추천에서 주제를 하나 고르면/),
    ).toBeInTheDocument();
  });

  test("돌아갈 단계 링크가 backTo 를 가리킨다", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "주제 추천으로 돌아가기" });
    expect(link).toHaveAttribute("href", "/app/inquiry/topics");
  });
});
