import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import { NOTICE_MESSAGES } from "./copy";
import Notice from "./Notice";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("Notice", () => {
  it("온라인문의 링크를 누르면 kakao_inquiry_click을 signup_notice로 보낸다", () => {
    render(
      <MemoryRouter>
        <Notice message="가입할 수 없어요" hint="inquiry" />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("link", { name: NOTICE_MESSAGES.inquiryLink }),
    );

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "signup_notice",
    });
  });
});
