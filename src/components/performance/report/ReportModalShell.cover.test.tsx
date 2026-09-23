// QA 2차 시트 행37·51 — 수행평가 리포트 모달(설계/평가 공용 껍데기)에 공용 표지
// (ReportCoverPage)를 인쇄 전용으로 붙인다. 화면 모달에는 보이지 않는다
// ("print:block hidden 류" 결정).
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportModalShell from "./ReportModalShell";

const noop = () => {};

describe("ReportModalShell — 표지", () => {
  it("표지에 title·studentName을 반영한다", () => {
    render(
      <ReportModalShell
        open
        title="평가 리포트"
        studentName="김민준"
        scrollLabel="본문"
        onClose={noop}
      >
        본문
      </ReportModalShell>,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).toHaveTextContent("평가 리포트");
    expect(cover).toHaveTextContent("김민준 학생");
  });

  it("표지는 화면에서 숨기고 인쇄에서만 보인다", () => {
    render(
      <ReportModalShell
        open
        title="평가 리포트"
        scrollLabel="본문"
        onClose={noop}
      >
        본문
      </ReportModalShell>,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    const wrapper = cover.closest(".hidden");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("print:block");
  });
});
