// 리포트 표지 실측 데모 - 표지를 로컬에서 반복 실측하는 개발 전용 화면.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
});
