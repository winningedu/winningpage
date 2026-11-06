// 스쿨멘토는 소진 안내에 기관 한도 문구(결정 99)를 보이고 구매 링크를 숨긴다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import QuotaExhaustedBanner from "./QuotaExhaustedBanner";
import QuotaExhaustedCard from "./QuotaExhaustedCard";

vi.mock("@/config/site", () => ({
  site: { features: { tenantServiceGate: true } },
}));

describe("회차 소진 안내 (스쿨멘토)", () => {
  it("배너는 월 한도 문구만 보이고 링크가 없다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedBanner tenantReason="month_cap" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("카드는 학기 한도 문구만 보이고 구매 링크가 없다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedCard tenantReason="term_cap" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
