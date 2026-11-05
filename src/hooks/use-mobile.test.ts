// useIsMobile 은 첫 그림부터 창 너비를 따라, 휴대폰이 데스크톱 값으로 시작하지 않게 한다.

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
  const desktopWidth = window.innerWidth;
  afterEach(() => {
    window.innerWidth = desktopWidth;
  });

  it("768 미만이면 첫 그림에서 이미 true 다", () => {
    window.innerWidth = 500;
    const seen: boolean[] = [];
    renderHook(() => {
      const value = useIsMobile();
      seen.push(value);
      return value;
    });

    expect(seen[0]).toBe(true);
  });
});
