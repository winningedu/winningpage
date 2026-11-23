import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import NoEntitlementCard from "./NoEntitlementCard";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

afterEach(() => {
  cleanup();
  vi.mocked(trackEvent).mockClear();
});

const renderCard = (
  reason: Parameters<typeof NoEntitlementCard>[0]["tenantReason"],
) =>
  render(
    <MemoryRouter>
      <NoEntitlementCard tenantReason={reason} onJoined={() => {}} />
    </MemoryRouter>,
  );

describe("NoEntitlementCard", () => {
  it("위닝은 이용권 알아보기 링크를 보인다", () => {
    siteState.tenantServiceGate = false;
    renderCard(null);
    expect(
      screen.getByRole("link", { name: "이용권 알아보기" }),
    ).toHaveAttribute("href", "/pricing?service=growth");
  });

  it("이용권 알아보기 링크를 누르면 paywall_cta_click을 survey로 보낸다", () => {
    siteState.tenantServiceGate = false;
    renderCard(null);

    fireEvent.click(screen.getByRole("link", { name: "이용권 알아보기" }));

    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "growth",
      location: "survey",
    });
  });

  it("스쿨멘토는 사유 문구만 보이고 링크가 없다", () => {
    siteState.tenantServiceGate = true;
    renderCard("outside_period");
    expect(
      screen.getByText(
        "지금은 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
