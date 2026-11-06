import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SITES } from "@/config/sites";
import Footer from "./Footer";

vi.mock("@/config/site", async () => {
  const { SITES } = await import("@/config/sites");
  return { site: SITES.schoolmentor };
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe("b2b Footer", () => {
  it("WINNING LOGIC 띠에 링크와 회사 정보, 저작권 줄을 보여 주고 통신판매업 번호는 없다", () => {
    renderFooter();
    const { company } = SITES.schoolmentor;

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("WINNING LOGIC")).toBeInTheDocument();
    expect(
      within(footer).getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      within(footer).getByRole("link", { name: "이용약관" }),
    ).toHaveAttribute("href", "/terms");
    // 결정 26: 저작권보호정책 페이지가 생기기 전까지 링크를 그리지 않는다.
    expect(
      within(footer).queryByText("저작권보호정책"),
    ).not.toBeInTheDocument();

    expect(
      within(footer).getByText(
        `상호명: ${company.name} | 대표: ${company.ceo}`,
      ),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText(`법인등록번호: ${company.corpRegNo}`),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText(`사업자 등록번호: ${company.bizRegNo}`),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText("주소: 세종특별자치시 마음안1로 61, 404-B호"),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText("(고운동, 세종 리치먼드힐2 타운하우스)"),
    ).toBeInTheDocument();
    expect(
      within(footer).getByText(
        "Copyright © WINNING LOGIC. All rights reserved.",
      ),
    ).toBeInTheDocument();
    expect(within(footer).queryByText(/통신판매업/)).not.toBeInTheDocument();
  });
});
