import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import SpecialHighschoolAdmission from "./SpecialHighschoolAdmission";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("SpecialHighschoolAdmission", () => {
  it("카카오톡 상담 CTA를 누르면 kakao_inquiry_click을 premium으로 보낸다", () => {
    render(
      <MemoryRouter>
        <SpecialHighschoolAdmission />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "카카오톡 상담" }));

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "premium",
    });
  });

  it("05번 박스는 실전 코칭이고 학습 코칭은 04번만 남는다(위아래 2회 렌더)", () => {
    render(
      <MemoryRouter>
        <SpecialHighschoolAdmission />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("실전 코칭")).toHaveLength(2);
    expect(screen.getAllByText("학습 코칭")).toHaveLength(2);
  });
});
