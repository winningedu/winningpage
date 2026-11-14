// 위닝에듀 프리미엄 이용 화면의 문구를 고정한다. 이용안내(스쿨멘토) 화면이 같은
// 컴포넌트를 쓰게 되어도 위닝에듀 출력은 바뀌지 않아야 한다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/premiumBook/usePremiumBookPages", () => ({
  usePremiumBookPages: () => ({
    pages: [],
    loading: false,
    error: null,
    retry: () => {},
  }),
}));

const { default: PremiumApply } = await import("./PremiumApply");

function renderPage() {
  return render(
    <MemoryRouter>
      <PremiumApply />
    </MemoryRouter>,
  );
}

describe("PremiumApply (위닝에듀)", () => {
  it("히어로와 상담 신청 머리말이 프리미엄 문구 그대로다", () => {
    renderPage();

    expect(screen.getByText("프리미엄 이용")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "위닝에듀만의 프리미엄 서비스를 확인해보세요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("문의")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "프리미엄 서비스 상담 신청하기",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "문의사항을 남겨주시면 위닝에듀 팀이 확인 후 연락드립니다.",
      ),
    ).toBeInTheDocument();
  });

  it("책자 뷰어 접근성 이름이 프리미엄 안내 책자 그대로다", () => {
    renderPage();

    expect(
      screen.getByRole("group", { name: "프리미엄 안내 책자" }),
    ).toBeInTheDocument();
  });

  it("이메일 예시와 서비스 선택지가 프리미엄 6종이다", () => {
    renderPage();

    expect(
      screen.getByPlaceholderText("example@winningedu.com"),
    ).toBeInTheDocument();
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "이용 서비스 선택",
      "대입컨설팅 프로그램",
      "특목고입학 프로그램",
      "대학원입학 프로그램",
      "해외명문대 진학컨설팅",
      "국제학교 학습관리",
      "국제・해외고 국내대 입학컨설팅",
    ]);
  });
});
