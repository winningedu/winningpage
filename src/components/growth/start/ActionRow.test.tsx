import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionRow from "./ActionRow";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

afterEach(cleanup);

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
