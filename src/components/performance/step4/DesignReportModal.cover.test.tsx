// 설계 리포트 모달이 학년과 저장일(report.updatedAt)을 ReportModalShell 표지까지 전달한다.
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DesignReportModal from "./DesignReportModal";

const noop = () => {};
const report = {
  sections: [{ id: "a", label: "개요", text: "본문" }],
  updatedAt: "2026-10-16T03:00:00Z",
};

describe("DesignReportModal - 표지", () => {
  it("studentGrade와 report.updatedAt을 표지 학년, 저장일에 반영한다", () => {
    render(
      <DesignReportModal
        open
        report={report}
        studentName="김민준"
        studentGrade="고3"
        onClose={noop}
      />,
    );

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).toHaveTextContent("학년고등학교 3학년");
    expect(info).toHaveTextContent("저장일2026.10.16");
  });

  it("studentGrade가 없으면 학년 칸이 없다", () => {
    render(
      <DesignReportModal
        open
        report={report}
        studentName="김민준"
        onClose={noop}
      />,
    );

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).not.toHaveTextContent("학년");
  });
});
