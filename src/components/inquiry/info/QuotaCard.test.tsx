import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import QuotaCard from "./QuotaCard";

const base = {
  quotaTotal: 10,
  quotaUsed: 3,
  quotaRemaining: 7,
  planEndsAt: null,
  planLabel: null,
};

describe("QuotaCard", () => {
  test("잔여 회차를 n / m 으로 보여 준다", () => {
    render(<QuotaCard quota={base} />);
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText("/ 10회")).toBeVisible();
  });

  test("차감 시점 문구를 보여 준다", () => {
    render(<QuotaCard quota={base} />);
    expect(
      screen.getByText(
        "주제 추천이 성공할 때 1회 차감돼요. 재추천, 설계, 평가, 재평가는 차감하지 않아요",
      ),
    ).toBeVisible();
  });

  test("잔여가 없는 값이면 무제한이라고 적는다", () => {
    render(
      <QuotaCard
        quota={{
          ...base,
          quotaTotal: null,
          quotaUsed: null,
          quotaRemaining: null,
        }}
      />,
    );
    expect(screen.getByText("무제한")).toBeVisible();
  });
});
