import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportSheetA4 from "./ReportSheetA4";

vi.mock("@/config/site", () => ({
  site: { brandName: "스쿨멘토" },
}));

describe("ReportSheetA4 — 사이트별 브랜드", () => {
  it("페이지 라벨(aria-label)에 site.brandName을 쓴다", () => {
    render(
      <ReportSheetA4 page={1} totalPages={2}>
        content
      </ReportSheetA4>,
    );

    expect(
      screen.getByLabelText("스쿨멘토 학습진단 리포트 1페이지 / 2페이지"),
    ).toBeInTheDocument();
  });
});
