import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportSheet from "./ReportSheet";

describe("ReportSheet", () => {
  it("numbered sheet shows the fixed N / 16 footer and the student-only mark", () => {
    render(
      <ReportSheet page={3}>
        <p>본문</p>
      </ReportSheet>,
    );
    expect(screen.getByText("3 / 16")).toBeInTheDocument();
    expect(screen.getByText("위닝에듀 학생 전용")).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
  });
});
