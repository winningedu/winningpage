import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

const stepMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryScreenStep: stepMock,
  useInquiryShell: () => ({ session: null, isBootstrapLoading: false }),
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import DesignPage from "./DesignPage";
import EvaluatePage from "./EvaluatePage";
import FinalizePage from "./FinalizePage";
import ReportDetailPage from "./ReportDetailPage";
import ReportsPage from "./ReportsPage";
import WritePage from "./WritePage";

describe.each([
  ["DesignPage", DesignPage, 3, "설계 리포트"],
  ["WritePage", WritePage, 4, "보고서 작성"],
  ["EvaluatePage", EvaluatePage, 5, "평가 리포트"],
  ["FinalizePage", FinalizePage, 6, "확정과 적립"],
] as const)("%s", (_name, Page, step, title) => {
  test("자기 단계를 셸에 올리고 세션이 없으면 안내 카드를 그린다", () => {
    stepMock.mockClear();
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    expect(stepMock).toHaveBeenCalledWith(step);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "정보 입력으로 돌아가기" }),
    ).toBeVisible();
  });
});

describe.each([
  ["ReportsPage", ReportsPage, "보관함"],
  ["ReportDetailPage", ReportDetailPage, "탐구 기록"],
] as const)("%s", (_name, Page, title) => {
  test("단계 밖 화면이라 단계를 비운다", () => {
    stepMock.mockClear();
    render(<Page />);
    expect(stepMock).toHaveBeenCalledWith(null);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
  });
});
