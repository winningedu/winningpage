import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const shell = vi.hoisted(() => ({
  value: {
    session: null as unknown,
    isBootstrapLoading: false,
  },
}));

vi.mock("./InquiryShellContext", () => ({
  useInquiryShell: () => shell.value,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import StepGate from "./StepGate";

function renderGate() {
  return render(
    <MemoryRouter>
      <StepGate step={3} title="설계 리포트" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  shell.value = { session: null, isBootstrapLoading: false };
});

describe("StepGate", () => {
  test("부트스트랩 로딩 중에는 안내 대신 로딩 표시를 그린다", () => {
    shell.value = { session: null, isBootstrapLoading: true };
    renderGate();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("선행 조건이 미충족이면 안내 카드를 그린다", () => {
    shell.value = {
      session: {
        currentStep: 2,
        selectedTopicId: null,
        designReportId: null,
        latestEvaluationId: null,
      },
      isBootstrapLoading: false,
    };
    renderGate();
    expect(screen.getByRole("heading", { name: "설계 리포트" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "아직 설계 리포트가 없어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "주제 추천으로 돌아가기" }),
    ).toBeVisible();
  });

  test("선행 조건이 충족되면 안내 카드를 그리지 않는다", () => {
    shell.value = {
      session: {
        currentStep: 3,
        selectedTopicId: "t1",
        designReportId: "d1",
        latestEvaluationId: null,
      },
      isBootstrapLoading: false,
    };
    renderGate();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
