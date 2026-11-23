import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

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

describe("회차 소진 안내의 이용권 구매 클릭 이벤트", () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it("배너 링크를 누르면 paywall_cta_click을 banner로 보낸다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedBanner />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "이용권 구매하기" }));
    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "performance",
      location: "banner",
    });
  });

  it("카드 링크를 누르면 paywall_cta_click을 chat_card로 보낸다", () => {
    render(
      <MemoryRouter>
        <QuotaExhaustedCard />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: /이용권 구매하기/ }));
    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "performance",
      location: "chat_card",
    });
  });
});
