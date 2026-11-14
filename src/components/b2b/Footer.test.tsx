import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FooterOperatorImage } from "@/components/footer/useFooterOperatorImage";
import Footer from "./Footer";

vi.mock("@/config/site", async () => {
  const { SITES } = await import("@/config/sites");
  return { site: SITES.schoolmentor };
});

const operatorImage = vi.hoisted(() => ({
  value: null as FooterOperatorImage | null,
}));
vi.mock("@/components/footer/useFooterOperatorImage", () => ({
  useFooterOperatorImage: () => operatorImage.value,
}));

beforeEach(() => {
  operatorImage.value = null;
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

// 시안(운영위탁 줄 세 개)과 글자 그대로 같아야 한다.
const COMPANY_LINES = [
  "(운영위탁) 상호명: 주식회사 위닝로직 | 대표: 강원석 | 소프트웨어 사업자",
  "사업자 등록번호: 783-81-04298 | 특허등록: 10-3038224",
  "주소: 세종특별자치시 마음안1로 61, 404-B호",
];

function expectCommonFooterContent(footer: HTMLElement) {
  expect(within(footer).getByText("WINNING LOGIC")).toBeInTheDocument();
  expect(
    within(footer).getByRole("link", { name: "개인정보처리방침" }),
  ).toHaveAttribute("href", "/privacy");
  expect(
    within(footer).getByRole("link", { name: "이용약관" }),
  ).toHaveAttribute("href", "/terms");
  // 결정 26: 저작권보호정책 페이지가 생기기 전까지 링크를 그리지 않는다.
  expect(within(footer).queryByText("저작권보호정책")).not.toBeInTheDocument();
  for (const line of COMPANY_LINES) {
    const paragraph = within(footer).getByText(
      (_, element) => element?.tagName === "P" && element.textContent === line,
    );
    expect(paragraph).toBeInTheDocument();
  }
  expect(
    within(footer).getByText("Copyright © WINNING LOGIC. All rights reserved."),
  ).toBeInTheDocument();
  expect(within(footer).queryByText(/통신판매업/)).not.toBeInTheDocument();
  expect(within(footer).queryByText(/법인등록번호/)).not.toBeInTheDocument();
}

describe("b2b Footer", () => {
  it("운영기관 이미지가 없으면 이미지와 구분선 없이 WINNING LOGIC 블록만 보여 준다", () => {
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    expectCommonFooterContent(footer);
    expect(within(footer).queryByRole("img")).not.toBeInTheDocument();
    expect(within(footer).queryByRole("separator")).not.toBeInTheDocument();
  });
});
