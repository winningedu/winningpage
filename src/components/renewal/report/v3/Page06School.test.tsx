import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page06School from "./Page06School";
import { FRONT_PAGES } from "./testPages";

const p6 = FRONT_PAGES.p6;
const TOC = "학교생활 입시 준비도";

describe("Page06School", () => {
  it("shows area bars in payload order (low to high) with total and grade text", () => {
    render(<Page06School page={p6} tocTitle={TOC} />);
    const bars = screen.getAllByRole("img");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
      "탐구 심화 56",
      "입시 전략 65",
      "교과 관리 91",
    ]);
    expect(screen.getByText("68.4")).toBeInTheDocument();
    expect(screen.getByText(p6.bars.gradeText)).toBeInTheDocument();
    expect(screen.getByText("6 / 16")).toBeInTheDocument();
  });

  it("shows hardest picks, overlap, strengths, weaknesses and the prescription", () => {
    render(<Page06School page={p6} tocTitle={TOC} />);
    expect(screen.getByText(/탐구 주제를 정하기 어려워요\./)).toHaveTextContent(
      "탐구 심화",
    );
    expect(screen.getByText(p6.overlap)).toBeInTheDocument();
    expect(screen.getByText("교과 관리 91")).toBeInTheDocument();
    expect(screen.getByText(p6.strengthNote as string)).toBeInTheDocument();
    expect(screen.getByText("탐구 심화 56")).toBeInTheDocument();
    expect(
      screen.getByText("별로 이하로 답한 문항이 없습니다."),
    ).toBeInTheDocument();
  });

  it("hides the hardest list when q12 had no picks", () => {
    const { hardest: _h, strengthNote: _n, ...rest } = p6;
    render(<Page06School page={rest} tocTitle={TOC} />);
    expect(screen.queryByText(/탐구 주제를 정하기 어려워요/)).toBeNull();
    expect(screen.queryByText(p6.strengthNote as string)).toBeNull();
    expect(screen.getByText(p6.overlap)).toBeInTheDocument();
  });
});
