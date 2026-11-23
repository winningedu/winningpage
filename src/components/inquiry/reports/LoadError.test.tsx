import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import { InquiryApiError } from "@/lib/inquiry/queries";
import LoadError from "./LoadError";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

afterEach(() => {
  cleanup();
  vi.mocked(trackEvent).mockClear();
});

const noEntitlement = (extra?: Record<string, unknown>) =>
  new InquiryApiError({
    kind: "error",
    status: 403,
    code: "NO_ENTITLEMENT",
    message: "x",
    ...(extra ? { extra } : {}),
  });

const renderError = (error: unknown) =>
  render(
    <MemoryRouter>
      <LoadError error={error} message="불러오지 못했어요" onRetry={() => {}} />
    </MemoryRouter>,
  );

describe("LoadError 이용권 없음", () => {
  it("위닝은 이용권 보기 링크를 그린다", () => {
    siteState.tenantServiceGate = false;
    renderError(noEntitlement());
    expect(screen.getByRole("link", { name: "이용권 보기" })).toHaveAttribute(
      "href",
      "/pricing?service=inquiry",
    );
  });

  it("이용권 보기 링크를 누르면 paywall_cta_click을 reports로 보낸다", () => {
    siteState.tenantServiceGate = false;
    renderError(noEntitlement());

    fireEvent.click(screen.getByRole("link", { name: "이용권 보기" }));

    expect(trackEvent).toHaveBeenCalledWith("paywall_cta_click", {
      service: "inquiry",
      location: "reports",
    });
  });

  it("스쿨멘토는 기관 사유만 보이고 링크가 없다", () => {
    siteState.tenantServiceGate = true;
    renderError(noEntitlement({ tenantReason: "disabled" }));
    expect(
      screen.getByText("기관에서 제공하지 않는 서비스예요."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
