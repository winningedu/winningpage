// 스쿨멘토 히어로(결정 21, M1~M2): 큰 배너와 작은 배너가 같은 순번으로 함께 넘어가고 점은 각 배너가 자기 장수만큼 가진다(QA 4차 9번: 이전에는 작은 배너 아래 한 줄만 뒀다).
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

  it("큰 배너와 작은 배너가 각자 장수만큼 점을 가진다", () => {
    renderHero();
    expect(screen.getAllByLabelText(/번째 메인 배너로 이동/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^\d번째 배너로 이동/)).toHaveLength(2);
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

  it("점을 누르면 두 배너가 함께 그 장으로 가고 누른 점이 현재로 표시된다", () => {
    renderHero();
    const mainDots = screen.getAllByLabelText(/번째 메인 배너로 이동/);
    fireEvent.click(mainDots[2] as HTMLElement);
    expect(shownIndex("메인 배너")).toBe(2);
    expect(shownIndex("이벤트 배너")).toBe(0);
    expect(mainDots[2]).toHaveAttribute("aria-current", "true");

    const sideDots = screen.getAllByLabelText(/^\d번째 배너로 이동/);
    fireEvent.click(sideDots[1] as HTMLElement);
    expect(shownIndex("메인 배너")).toBe(1);
    expect(shownIndex("이벤트 배너")).toBe(1);
    expect(sideDots[1]).toHaveAttribute("aria-current", "true");
  });

  it("한 배너가 한 장이면 그 배너에는 점이 없다", () => {
    renderHero({ sideBanners: sideBanners.slice(0, 1) });
    expect(screen.getAllByLabelText(/번째 메인 배너로 이동/)).toHaveLength(3);
    expect(screen.queryAllByLabelText(/^\d번째 배너로 이동/)).toHaveLength(0);
  });

  it("큰 배너 2장, 작은 배너 3장이면 큰 배너의 초로 0,1,0,1 순으로 넘어가고 경계에서 같은 장이 반복되지 않는다", () => {
    renderHero({
      banners: banners.slice(0, 2),
      sideBanners: [
        ...sideBanners,
        {
          id: "s3",
          title: "이벤트 3",
          image_url: "/s3.png",
          display_seconds: 99,
        },
      ],
    });
    const seen = [shownIndex("메인 배너")];
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(shownIndex("메인 배너")).toBe(seen[seen.length - 1]);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      seen.push(shownIndex("메인 배너"));
    }
    expect(seen).toEqual([0, 1, 0, 1]);
    expect(screen.getAllByLabelText(/^\d번째 배너로 이동/)).toHaveLength(3);
  });

  it("큰 배너가 한 장이면 작은 배너는 스스로 넘어가지 않고 점은 보이며 점을 누르면 작은 배너만 바뀐다", () => {
    renderHero({ banners: banners.slice(0, 1) });
    expect(screen.queryAllByLabelText(/번째 메인 배너로 이동/)).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(300000);
    });
    expect(shownIndex("이벤트 배너")).toBe(0);

    const sideDots = screen.getAllByLabelText(/^\d번째 배너로 이동/);
    expect(sideDots).toHaveLength(2);
    fireEvent.click(sideDots[1] as HTMLElement);
    expect(shownIndex("이벤트 배너")).toBe(1);
    expect(shownIndex("메인 배너")).toBe(0);
    expect(sideDots[1]).toHaveAttribute("aria-current", "true");
    expect(sideDots[0]).toHaveAttribute("aria-current", "false");
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
