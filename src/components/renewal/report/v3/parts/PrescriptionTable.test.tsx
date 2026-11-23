import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FRONT_PAGES } from "../testPages";
import PrescriptionTable from "./PrescriptionTable";

describe("PrescriptionTable", () => {
  it("shows intro, lever, weak rows with target and link, and strong items", () => {
    render(<PrescriptionTable rx={FRONT_PAGES.p4.rx} />);
    const rx = FRONT_PAGES.p4.rx;
    expect(screen.getByText(rx.intro)).toBeInTheDocument();
    expect(screen.getByText(rx.lever as string)).toBeInTheDocument();
    const row = screen
      .getByText("8-9 실제로 공부한 시간이나 분량을 기록한다.")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("별로에서 대체로로")).toBeInTheDocument();
    expect(
      within(row).getByText("1주차 11/11(수) 이번 주 할 일을 4칸으로 나누기"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/시험이나 한 주가 끝나면 결과를 보고 계획을 고친다\./),
    ).toHaveTextContent("매우");
  });

  it("shows the none text instead of a table and no lever when absent", () => {
    render(<PrescriptionTable rx={FRONT_PAGES.p6.rx} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText("별로 이하로 답한 문항이 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/지렛대/)).toBeNull();
  });
});
