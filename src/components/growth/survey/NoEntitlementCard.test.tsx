import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoEntitlementCard from "./NoEntitlementCard";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

afterEach(cleanup);

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

  it("스쿨멘토는 사유 문구만 보이고 링크가 없다", () => {
    siteState.tenantServiceGate = true;
    renderCard("outside_period");
    expect(
      screen.getByText(
        "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
