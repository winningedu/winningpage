import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import ActionRow from "./ActionRow";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

afterEach(() => {
  cleanup();
  vi.mocked(trackEvent).mockClear();
});

const props = {
  mode: "blocked" as const,
  canViewReports: false,
  onViewReports: () => {},
  onPrimary: () => {},
  onBuy: () => {},
};

describe("ActionRow 막힘", () => {
  it("위닝은 이용권 구매 버튼을 보인다", () => {
    siteState.tenantServiceGate = false;
    render(<ActionRow {...props} tenantReason="disabled" />);
    expect(
      screen.getByRole("button", { name: "이용권 구매하기" }),
    ).toBeInTheDocument();
  });

  it("이용권 구매 버튼을 누르면 onBuy와 paywall_cta_click을 보낸다", () => {
    siteState.tenantServiceGate = false;
    const onBuy = vi.fn();
    render(<ActionRow {...props} onBuy={onBuy} />);

    fireEvent.click(screen.getByRole("button", { name: "이용권 구매하기" }));

    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "growth",
      location: "start_page",
    });
  });

  it("스쿨멘토는 사유 문구만 보이고 구매 버튼이 없다", () => {
    siteState.tenantServiceGate = true;
    render(<ActionRow {...props} tenantReason="month_cap" />);
    expect(
      screen.getByText(
        "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "이용권 구매하기" }),
    ).not.toBeInTheDocument();
  });

  it("스쿨멘토 기타 소속은 소속코드 입력 버튼을 보인다", () => {
    siteState.tenantServiceGate = true;
    render(<ActionRow {...props} tenantReason="catch_all" />);
    expect(
      screen.getByRole("button", { name: "소속코드 입력" }),
    ).toBeInTheDocument();
  });
});
