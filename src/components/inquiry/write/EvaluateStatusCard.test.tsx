import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import EvaluateStatusCard from "./EvaluateStatusCard";

const gateState = vi.hoisted(() => ({ on: false }));
vi.mock("@/config/site", async (orig) => {
  const actual = await orig<typeof import("@/config/site")>();
  return {
    ...actual,
    site: {
      ...actual.site,
      features: {
        ...actual.site.features,
        get tenantServiceGate() {
          return gateState.on;
        },
      },
    },
  };
});

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

  test("스쿨멘토의 이용권 없음 카드는 기관 사유만 보이고 링크가 없다", () => {
    gateState.on = true;
    renderCard(
      <EvaluateStatusCard
        variant="noEntitlement"
        tenantReason="outside_period"
      />,
    );
    expect(
      screen.getByText(
        "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "이용권 보기" })).toBeNull();
    gateState.on = false;
  });
});
