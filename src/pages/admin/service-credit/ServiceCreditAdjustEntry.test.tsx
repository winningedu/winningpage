import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const flag = vi.hoisted(() => ({ hqTenantAdmin: false }));

vi.mock("@/config/site", () => ({
  site: { features: flag },
}));
vi.mock("./ServiceCreditAdjustAdmin", () => ({
  default: () => <div>위닝 이용권 조정</div>,
}));
vi.mock("@/pages/admin/tenants/StudentUsageAdmin", () => ({
  default: () => <div>기관 이용 한도 조정</div>,
}));

import ServiceCreditAdjustEntry from "./ServiceCreditAdjustEntry";

beforeEach(() => {
  flag.hqTenantAdmin = false;
});

describe("ServiceCreditAdjustEntry", () => {
  test("위닝은 기존 이용권 조정 화면을 그대로 쓴다", () => {
    render(
      <ServiceCreditAdjustEntry config={{ title: "서비스이용횟수조정" }} />,
    );

    expect(screen.getByText("위닝 이용권 조정")).toBeTruthy();
    expect(screen.queryByText("기관 이용 한도 조정")).toBeNull();
  });

  test("스쿨멘토는 기관 이용 한도 조정 화면으로 바꾼다", () => {
    flag.hqTenantAdmin = true;
    render(
      <ServiceCreditAdjustEntry config={{ title: "서비스이용횟수조정" }} />,
    );

    expect(screen.getByText("기관 이용 한도 조정")).toBeTruthy();
    expect(screen.queryByText("위닝 이용권 조정")).toBeNull();
  });
});
