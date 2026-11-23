import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import SubmitError from "./SubmitError";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderError = (error: Parameters<typeof SubmitError>[0]["error"]) =>
  render(
    <MemoryRouter>
      <SubmitError error={error} />
    </MemoryRouter>,
  );

describe("SubmitError 이용 막힘", () => {
  it("위닝은 이용권 보기 링크를 보인다", () => {
    siteState.tenantServiceGate = false;
    renderError({ kind: "quota", tenantReason: null });
    expect(screen.getByRole("link", { name: "이용권 보기" })).toHaveAttribute(
      "href",
      "/pricing?service=inquiry",
    );
  });

  it("이용권 없음의 이용권 보기를 누르면 paywall_cta_click 을 no_entitlement 로 보낸다", () => {
    siteState.tenantServiceGate = false;
    renderError({ kind: "entitlement", tenantReason: null });
    expect(trackEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "이용권 보기" }));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "inquiry",
      location: "no_entitlement",
    });
  });

  it.each([
    { kind: "quota", tenantReason: "term_cap" },
    { kind: "entitlement", tenantReason: "term_cap" },
  ] as const)("스쿨멘토는 %s 에서 기관 문구만 보이고 링크가 없다", (error) => {
    siteState.tenantServiceGate = true;
    renderError(error);
    expect(
      screen.getByText(
        "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
