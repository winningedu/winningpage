// 스쿨멘토 이용신청 > 서비스제공. 고객사가 준 정적 화면을 그대로 옮긴 안내 페이지다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ServiceOfferPage from "./ServiceOfferPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ServiceOfferPage />
    </MemoryRouter>,
  );
}

describe("ServiceOfferPage", () => {
  it("다섯 구역의 제목과 이용권 카드를 그린다", () => {
    renderPage();

    const headings = [
      "우리 교육기관에 맞는 서비스를 선택해주세요",
      "스쿨멘토 서비스 이용권",
      "학교와 교육기관이 선택하는 이유, 스쿨멘토!",
      "스쿨멘토는 학생 정보를 안전하게 관리합니다",
      "선생님의 업무를 도와주는 맞춤 학습관리, 원스톱 프로세스로 신청하세요!",
      "도입 상담 문의",
    ];
    // <br> 줄바꿈은 접근 가능한 이름에서 공백이 되지 않으므로 공백을 빼고 견준다.
    const squash = (text: string) => text.replace(/\s/g, "");
    for (const heading of headings) {
      expect(
        screen.getByRole("heading", {
          name: (name) => squash(name) === squash(heading),
        }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("radio", { name: /\[교육기관 패키지\] 개인 이용권/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
