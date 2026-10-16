// 고객사 요구: OS의 동작 줄이기(prefers-reduced-motion) 설정과 상관없이 히어로 배너는
// 항상 display_seconds 간격으로 자동 전환된다.

import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeroSection from "./HeroSection";

function mockReducedMotion() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const banners = [
  { id: "m1", image_url: "/m1.png", display_seconds: 3 },
  { id: "m2", image_url: "/m2.png", display_seconds: 3 },
];
const sideBanners = [
  { id: "s1", title: "이벤트 1", image_url: "/s1.png", display_seconds: 2 },
  { id: "s2", title: "이벤트 2", image_url: "/s2.png", display_seconds: 2 },
];

function renderHero() {
  return render(
    <MemoryRouter>
      <HeroSection banners={banners} sideBanners={sideBanners} />
    </MemoryRouter>,
  );
}

describe("HeroSection 동작 줄이기 설정", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("메인 배너가 reduce 환경에서도 display_seconds 뒤 다음 슬라이드로 넘어간다", () => {
    renderHero();
    const dots = screen.getAllByLabelText(/번째 메인 배너로 이동/);
    expect(dots[0]).toHaveAttribute("aria-current", "true");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(dots[1]).toHaveAttribute("aria-current", "true");
  });

  it("이벤트 배너가 reduce 환경에서도 display_seconds 뒤 다음 슬라이드로 넘어간다", () => {
    renderHero();
    const dots = screen.getAllByLabelText(/^\d번째 배너로 이동/);
    expect(dots[0]).toHaveAttribute("aria-current", "true");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(dots[1]).toHaveAttribute("aria-current", "true");
  });
});
