import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CoverPage from "./CoverPage";
import { FRONT_PAGES } from "./testPages";

const cover = FRONT_PAGES.cover;

describe("CoverPage", () => {
  it("shows student, grade and school type, date, headline, stages and basis", () => {
    render(<CoverPage cover={cover} />);
    expect(screen.getByText("김위닝")).toBeInTheDocument();
    expect(screen.getByText(/고등학교 2학년/)).toHaveTextContent("특목고");
    expect(screen.getByText("2026. 11. 10")).toBeInTheDocument();
    expect(screen.getByText(cover.headline)).toBeInTheDocument();
    expect(screen.getByText("우선순위")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText(cover.basis)).toBeInTheDocument();
  });

  it("lists every toc entry with its fixed two-digit page number", () => {
    render(<CoverPage cover={cover} />);
    const items = screen
      .getAllByRole("listitem")
      .filter((item) => item.closest("nav"));
    expect(items).toHaveLength(16);
    expect(items[6]).toHaveTextContent("07입시 준비도 목표 대학");
  });

  it("M3 toc without page 7 keeps the other numbers and drops 07", () => {
    const m3 = { ...cover, toc: cover.toc.filter((entry) => entry.page !== 7) };
    render(<CoverPage cover={m3} />);
    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveTextContent("07");
    expect(nav).not.toHaveTextContent("입시 준비도 목표 대학");
    expect(nav).toHaveTextContent("08재미로 보는 MBTI 학습 궁합");
  });

  it("omits the student name row when the profile has no name", () => {
    const { studentName: _name, ...noName } = cover;
    render(<CoverPage cover={noName} />);
    expect(screen.queryByText("학생명")).toBeNull();
  });
});
