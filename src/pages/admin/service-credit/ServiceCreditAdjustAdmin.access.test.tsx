import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { on, resetApi } from "./fakeApi";
import { renderCredit, STUDENT_ID, SUMMARY } from "./testKit";

const STUDENT_URL = `/admin/serviceCreditAdjust/${STUDENT_ID}`;

beforeEach(() => {
  resetApi();
  on("GET", "admin/service-credit-summary", SUMMARY);
});

describe("ServiceCreditAdjustAdmin 쓰기 권한", () => {
  test("edit 권한이면 조정 입력과 적용 버튼이 보인다", async () => {
    renderCredit(STUDENT_URL, true);
    await screen.findByText("위닝 성장설계");

    expect(
      screen.getAllByRole("button", { name: "적용" }).length,
    ).toBeGreaterThan(0);
  });

  test("view 권한이면 현황은 보이고 조정 입력과 적용 버튼은 없다", async () => {
    renderCredit(STUDENT_URL, false);
    await screen.findByText("위닝 성장설계");

    expect(
      screen.queryByRole("button", { name: "적용" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("사유")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "조정" }),
    ).not.toBeInTheDocument();
  });
});
