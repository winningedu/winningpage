import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SpecialHighschoolCaseCard from "./SpecialHighschoolCaseCard";

const row = {
  year: 2025,
  result_label: "합격자",
  student_name: "김윈",
  middle_school: "윈중",
  school_name: "서울과학고",
};

describe("SpecialHighschoolCaseCard 크림+골드 톤", () => {
  it("폴더 본체는 크림 배경이다", () => {
    render(<SpecialHighschoolCaseCard row={row} />);
    const body = screen.getByText("서울과학고").parentElement;
    expect(body).toHaveClass("bg-cream");
  });

  it("폴더 탭은 골드 배경이고 라벨은 흰 글자다", () => {
    render(<SpecialHighschoolCaseCard row={row} />);
    const label = screen.getByText("Success Case");
    expect(label.parentElement).toHaveClass("bg-gold-tab");
    expect(label).toHaveClass("text-white");
  });

  it("합격자/학교명 텍스트는 네이비다", () => {
    render(<SpecialHighschoolCaseCard row={row} />);
    expect(screen.getByText("서울과학고")).toHaveClass("text-navy-ink");
    expect(screen.getByText("2025년 고입 합격자")).toHaveClass("text-navy-ink");
  });

  it("골드 토큰은 참조 이미지 실측값이다", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain("--color-gold-tab: #e3a008;");
    expect(css).toContain("--color-gold-light: #f2c75c;");
  });
});
