import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import KakaoConsultButton from "./KakaoConsultButton";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("KakaoConsultButton", () => {
  it("상담하기를 누르면 kakao_inquiry_click을 mypage로 보낸다", () => {
    render(<KakaoConsultButton />);

    fireEvent.click(screen.getByRole("link", { name: /카카오톡 상담하기/ }));

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "mypage",
    });
  });
});
