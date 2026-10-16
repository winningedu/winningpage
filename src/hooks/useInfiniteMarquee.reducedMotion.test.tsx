// 고객사 요구: OS의 동작 줄이기(prefers-reduced-motion) 설정과 상관없이 마퀴는 항상 자동 스크롤한다.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteMarquee } from "./useInfiniteMarquee";

const ITEM_WIDTH = 100;
const ITEM_COUNT = 2;
const CYCLE_WIDTH = ITEM_COUNT * ITEM_WIDTH;

function TestMarquee() {
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: ITEM_COUNT,
  });

  return (
    <div
      data-testid="scroll"
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      {...containerHandlers}
    >
      {repeatIndices.map((itemIndex, position) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 테스트 전용 더미 마퀴 아이템
        <div key={position} data-item-index={itemIndex} />
      ))}
    </div>
  );
}

describe("useInfiniteMarquee 동작 줄이기 설정", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reduce 환경에서도 rAF가 진행되면 scrollLeft가 변한다", () => {
    const { getByTestId } = render(<TestMarquee />);
    const container = getByTestId("scroll") as HTMLDivElement;
    Array.from(container.children).forEach((child, position) => {
      Object.defineProperty(child, "offsetLeft", {
        value: position * ITEM_WIDTH,
        configurable: true,
      });
    });
    container.scrollTo = ((options?: ScrollToOptions | number) => {
      if (
        typeof options === "object" &&
        options !== null &&
        "left" in options
      ) {
        container.scrollLeft = options.left ?? container.scrollLeft;
      }
    }) as HTMLDivElement["scrollTo"];

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(container.scrollLeft).toBe(CYCLE_WIDTH);

    const before = container.scrollLeft;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(container.scrollLeft).not.toBe(before);
  });
});
