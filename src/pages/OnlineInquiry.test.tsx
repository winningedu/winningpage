import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import OnlineInquiry from "./OnlineInquiry";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("OnlineInquiry", () => {
  it("카카오톡 문의하기를 누르면 kakao_inquiry_click을 online_inquiry로 보낸다", () => {
    render(
      <MemoryRouter>
        <OnlineInquiry />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /카카오톡 문의하기/ }));

    expect(trackEvent).toHaveBeenCalledWith("kakao_inquiry_click", {
      location: "online_inquiry",
    });
  });
});
