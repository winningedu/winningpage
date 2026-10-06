import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import EvaluateStatusCard from "./EvaluateStatusCard";

function renderCard(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("EvaluateStatusCard", () => {
  test("실패 카드는 시도 횟수를 보이고 다시 시도를 부른다", () => {
    const onRetry = vi.fn();
    renderCard(
      <EvaluateStatusCard variant="failed" attempts={2} onRetry={onRetry} />,
    );
    expect(screen.getByText("평가 리포트를 만들지 못했어요")).toBeVisible();
    expect(screen.getByText("시도 2 / 10")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("시도 횟수를 모르면 줄을 숨긴다", () => {
    renderCard(
      <EvaluateStatusCard variant="failed" attempts={null} onRetry={vi.fn()} />,
    );
    expect(screen.queryByText(/시도 \d/)).toBeNull();
  });

  test("종결, 이용권 없음, 재평가 상한 카드의 링크", () => {
    const { unmount } = renderCard(<EvaluateStatusCard variant="terminal" />);
    expect(
      screen.getByRole("link", { name: "처음부터 다시 시작" }),
    ).toHaveAttribute("href", "/app/inquiry");
    unmount();
    const second = renderCard(<EvaluateStatusCard variant="noEntitlement" />);
    expect(screen.getByRole("link", { name: "이용권 보기" })).toHaveAttribute(
      "href",
      "/pricing?service=inquiry",
    );
    second.unmount();
    renderCard(<EvaluateStatusCard variant="reevaluationLimit" />);
    expect(
      screen.getByRole("link", { name: "평가 리포트 보기" }),
    ).toHaveAttribute("href", "/app/inquiry/evaluate");
  });
});
