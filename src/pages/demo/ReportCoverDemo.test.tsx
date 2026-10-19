// 리포트 표지 실측 데모 - 표지를 로컬에서 반복 실측하는 개발 전용 화면.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/context/ToastContext";
import ReportCoverDemo from "./ReportCoverDemo";

function renderDemo() {
  return render(
    <ToastProvider>
      <ReportCoverDemo />
    </ToastProvider>,
  );
}

describe("ReportCoverDemo", () => {
  it("기본 종류(학습진단) 표지를 렌더한다", () => {
    renderDemo();

    expect(screen.getByLabelText("학습진단 리포트 표지")).toBeInTheDocument();
    expect(screen.getByText("LEARNING DIAGNOSIS REPORT")).toBeInTheDocument();
  });

  it("종류를 바꾸면 표지의 영문 라벨이 바뀐다", () => {
    renderDemo();

    fireEvent.change(screen.getByLabelText("종류"), {
      target: { value: "selfeval" },
    });

    expect(screen.getByText("SELF EVALUATION REPORT")).toBeInTheDocument();
    expect(
      screen.queryByText("LEARNING DIAGNOSIS REPORT"),
    ).not.toBeInTheDocument();
  });

  it("학생명 빼기를 켜면 학생명 칸이 사라진다", () => {
    renderDemo();
    expect(screen.getByText("학생명")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("학생명 빼기"));

    expect(screen.queryByText("학생명")).not.toBeInTheDocument();
    expect(screen.getByText("학년")).toBeInTheDocument();
  });

  it("flow 표지가 미리보기 영역 안에서 화면에 보이도록 데모 규칙을 건다", () => {
    const { container } = renderDemo();

    const preview = screen.getByTestId("cover-preview");
    expect(
      within(preview).getByLabelText("학습진단 리포트 표지"),
    ).toBeInTheDocument();
    const css = Array.from(container.querySelectorAll("style"))
      .map((node) => node.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/\.fd-report-cover-flow[^}]*display:\s*block/);
  });

  it("a4 방식을 고르면 표지가 fd-report-sheet 시트로 그려진다", () => {
    renderDemo();

    fireEvent.change(screen.getByLabelText("방식"), {
      target: { value: "a4" },
    });

    expect(screen.getByLabelText("학습진단 리포트 표지")).toHaveClass(
      "fd-report-sheet",
    );
  });

  it("표지 뒤 더미 본문을 켜면 인쇄 영역 안 표지 다음에 더미 본문이 생긴다", () => {
    renderDemo();
    expect(screen.queryByTestId("dummy-body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("표지 뒤 더미 본문 1장"));

    const dummy = screen.getByTestId("dummy-body");
    expect(screen.getByTestId("print-root")).toContainElement(dummy);
  });

  it("조작 패널은 인쇄 영역 밖에 있다", () => {
    renderDemo();

    expect(screen.getByTestId("print-root")).not.toContainElement(
      screen.getByLabelText("종류"),
    );
  });
});
