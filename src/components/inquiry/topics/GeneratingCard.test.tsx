import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import GeneratingCard from "./GeneratingCard";

describe("GeneratingCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("status 역할로 첫 문구를 그리고 시간이 지나면 다음 문구로 순환한다", () => {
    render(
      <GeneratingCard title="주제를 만드는 중" lines={["하나", "둘", "셋"]} />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("하나");
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(status.textContent).toContain("둘");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(status.textContent).toContain("하나");
  });
});
