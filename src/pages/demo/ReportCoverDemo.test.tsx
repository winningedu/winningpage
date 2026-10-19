// 리포트 표지 실측 데모 - 표지를 로컬에서 반복 실측하는 개발 전용 화면.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
