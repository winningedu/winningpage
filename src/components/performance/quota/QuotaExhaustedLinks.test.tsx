import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import QuotaExhaustedBanner from "./QuotaExhaustedBanner";
import QuotaExhaustedCard from "./QuotaExhaustedCard";

describe("회차 소진 안내의 이용권 구매 링크", () => {
  it("배너는 /pricing 으로 보낸다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedBanner />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "이용권 구매하기" }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("카드는 /pricing 으로 보낸다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedCard />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /이용권 구매하기/ }),
    ).toHaveAttribute("href", "/pricing");
  });
});
