// 스쿨멘토 히어로(결정 21, M1~M2): 큰 배너와 작은 배너가 같은 순번으로 함께 넘어가고 점은 작은 배너 아래 한 줄만 둔다.
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeroSection from "./HeroSection";

const banners = [
  { id: "m1", image_url: "/m1.png", display_seconds: 3 },
  { id: "m2", image_url: "/m2.png", display_seconds: 3 },
  { id: "m3", image_url: "/m3.png", display_seconds: 3 },
];
const sideBanners = [
  { id: "s1", title: "이벤트 1", image_url: "/s1.png", display_seconds: 99 },
  { id: "s2", title: "이벤트 2", image_url: "/s2.png", display_seconds: 99 },
];

function renderHero(
  props: Partial<React.ComponentProps<typeof HeroSection>> = {},
) {
  return render(
    <MemoryRouter>
      <HeroSection
        syncedSlides
        banners={banners}
        sideBanners={sideBanners}
        {...props}
      />
    </MemoryRouter>,
  );
}

// 슬라이드 트랙의 현재 위치(translateX 백분율)로 어느 장이 보이는지 읽는다.
function shownIndex(label: string) {
  const track = screen.getByRole("region", { name: label }).firstElementChild;
  const match = /translateX\(-(\d+)%\)/.exec(
    (track as HTMLElement).style.transform,
  );
  return Number(match?.[1] ?? 0) / 100;
}

describe("HeroSection syncedSlides", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("점은 한 줄뿐이고 큰 배너 장수만큼 있다", () => {
    renderHero();
    expect(
      screen.getAllByRole("button", { name: /번째 배너로 이동/ }),
    ).toHaveLength(3);
    expect(screen.queryByLabelText(/번째 메인 배너로 이동/)).toBeNull();
  });

  it("큰 배너의 display_seconds로 두 배너가 함께 넘어간다", () => {
    renderHero();
    expect(shownIndex("메인 배너")).toBe(0);
    expect(shownIndex("이벤트 배너")).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(shownIndex("메인 배너")).toBe(1);
    expect(shownIndex("이벤트 배너")).toBe(1);
  });

  it("작은 배너는 장수가 모자라면 순번을 나머지로 돌린다", () => {
    renderHero();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(shownIndex("메인 배너")).toBe(2);
    expect(shownIndex("이벤트 배너")).toBe(0);
  });

  it("점을 누르면 두 배너가 함께 그 장으로 간다", () => {
    renderHero();
    const dots = screen.getAllByRole("button", { name: /번째 배너로 이동/ });
    fireEvent.click(dots[2] as HTMLElement);
    expect(shownIndex("메인 배너")).toBe(2);
    expect(shownIndex("이벤트 배너")).toBe(0);
    expect(dots[2]).toHaveAttribute("aria-current", "true");
  });

  it("큰 배너가 한 장이면 점이 없다", () => {
    renderHero({ banners: banners.slice(0, 1) });
    expect(
      screen.queryByRole("button", { name: /번째 배너로 이동/ }),
    ).toBeNull();
  });
});

describe("HeroSection 기본(위닝)", () => {
  it("syncedSlides가 없으면 점 줄이 둘이다", () => {
    render(
      <MemoryRouter>
        <HeroSection banners={banners} sideBanners={sideBanners} />
      </MemoryRouter>,
    );
    expect(screen.getAllByLabelText(/번째 메인 배너로 이동/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^\d번째 배너로 이동/)).toHaveLength(2);
  });
});
