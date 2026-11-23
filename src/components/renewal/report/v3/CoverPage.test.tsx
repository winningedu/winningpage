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

  it("captions the 7 scores as PDF p1 and marks broken stages with a red dashed rule", () => {
    render(<CoverPage cover={cover} />);
    expect(
      screen.getByText(
        "7단계 학습관리 점수 \u00b7 붉은 표시는 순환이 끊기는 지점",
      ),
    ).toBeInTheDocument();
    const broken = screen.getByText("우선순위").closest("li");
    expect(broken).toHaveAttribute("data-broken", "true");
    expect(broken).toHaveClass("border-dashed", "border-error");
    expect(broken).toHaveTextContent("여기서 끊김");
    const kept = screen.getByText("목표 설정").closest("li");
    expect(kept).not.toHaveAttribute("data-broken");
  });

  it("lists every toc entry with its fixed two-digit page number", () => {
    render(<CoverPage cover={cover} />);
    const items = screen
      .getAllByRole("listitem")
      .filter((item) => item.closest("nav"));
    expect(items).toHaveLength(16);
    expect(items[6]).toHaveTextContent("07입시 준비도 \u00b7 목표 대학");
  });

  it("shows the PDF titles even when the engine toc carries its own section names", () => {
    const sheetTitles = {
      ...cover,
      toc: cover.toc.map((entry) => ({ ...entry, title: "섹션명" })),
    };
    render(<CoverPage cover={sheetTitles} />);
    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveTextContent("섹션명");
    expect(nav).toHaveTextContent("01진단 요약");
    expect(nav).toHaveTextContent("12 1주차 목표과제 플래너".replace(" ", ""));
  });

  it("M3 toc without page 7 keeps the other numbers and drops 07", () => {
    const m3 = { ...cover, toc: cover.toc.filter((entry) => entry.page !== 7) };
    render(<CoverPage cover={m3} />);
    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveTextContent("07");
    expect(nav).not.toHaveTextContent("목표 대학");
    expect(nav).toHaveTextContent("08재미로 보는 MBTI 학습 궁합");
  });

  it("omits the student name row when the profile has no name", () => {
    const { studentName: _name, ...noName } = cover;
    render(<CoverPage cover={noName} />);
    expect(screen.queryByText("학생명")).toBeNull();
  });
});
