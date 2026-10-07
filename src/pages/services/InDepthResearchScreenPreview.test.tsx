import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import InDepthResearchScreenPreview from "./InDepthResearchScreenPreview";

const inViewState = vi.hoisted(() => ({ value: true }));

vi.mock("@/hooks/useInView", () => ({
  useInView: () => [{ current: null }, inViewState.value],
}));

const originalMatchMedia = window.matchMedia;

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function selectedLabels() {
  return screen
    .getAllByRole("tab")
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.getAttribute("aria-label"));
}

beforeEach(() => {
  vi.useFakeTimers();
  inViewState.value = true;
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe("InDepthResearchScreenPreview", () => {
  test("점 3개 중 첫 번째만 선택되고 첫 이미지만 보인다", () => {
    render(<InDepthResearchScreenPreview />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");

    const design = screen.getByAltText("설계 리포트 화면");
    const write = screen.getByAltText("보고서 작성 화면");
    const evaluate = screen.getByAltText("평가 리포트 화면");
    expect(design).not.toHaveAttribute("hidden");
    expect(write).toHaveAttribute("hidden");
    expect(evaluate).toHaveAttribute("hidden");
  });

  test("점을 클릭하면 그 슬라이드가 활성화되고 tabpanel 이 그 탭을 가리킨다", () => {
    render(<InDepthResearchScreenPreview />);

    const tab = screen.getByRole("tab", { name: "보고서 작성 화면 보기" });
    fireEvent.click(tab);

    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByAltText("보고서 작성 화면")).not.toHaveAttribute(
      "hidden",
    );
    expect(screen.getByAltText("설계 리포트 화면")).toHaveAttribute("hidden");
    expect(screen.getByAltText("평가 리포트 화면")).toHaveAttribute("hidden");
    expect(screen.getByRole("tabpanel", { hidden: true })).toHaveAttribute(
      "aria-labelledby",
      tab.id,
    );
  });

  test("5초마다 다음 슬라이드로 돌고 마지막 뒤에는 첫 번째로 돌아온다", () => {
    render(<InDepthResearchScreenPreview />);

    advance(5000);
    expect(selectedLabels()).toEqual(["보고서 작성 화면 보기"]);
    advance(5000);
    expect(selectedLabels()).toEqual(["평가 리포트 화면 보기"]);
    advance(5000);
    expect(selectedLabels()).toEqual(["설계 리포트 화면 보기"]);
  });

  test("점 클릭 뒤에는 타이머가 다시 시작해 클릭 5초 뒤에 다음으로 간다", () => {
    render(<InDepthResearchScreenPreview />);

    advance(4000);
    fireEvent.click(screen.getByRole("tab", { name: "보고서 작성 화면 보기" }));
    advance(4000);
    expect(selectedLabels()).toEqual(["보고서 작성 화면 보기"]);
    advance(1000);
    expect(selectedLabels()).toEqual(["평가 리포트 화면 보기"]);
  });

  test("hover 중에는 멈추고 mouseLeave 뒤에는 다시 돈다", () => {
    const { container } = render(<InDepthResearchScreenPreview />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(root);
    advance(10000);
    expect(selectedLabels()).toEqual(["설계 리포트 화면 보기"]);

    fireEvent.mouseLeave(root);
    advance(5000);
    expect(selectedLabels()).toEqual(["보고서 작성 화면 보기"]);
  });

  test("루트 안에 포커스가 있으면 멈추고 포커스가 빠지면 다시 돈다", () => {
    render(<InDepthResearchScreenPreview />);
    const tab = screen.getByRole("tab", { name: "설계 리포트 화면 보기" });

    fireEvent.focus(tab);
    advance(10000);
    expect(selectedLabels()).toEqual(["설계 리포트 화면 보기"]);

    fireEvent.blur(tab);
    advance(5000);
    expect(selectedLabels()).toEqual(["보고서 작성 화면 보기"]);
  });

  test("prefers-reduced-motion 이면 자동 전환하지 않는다", () => {
    stubReducedMotion(true);
    render(<InDepthResearchScreenPreview />);

    advance(10000);
    expect(selectedLabels()).toEqual(["설계 리포트 화면 보기"]);
  });

  test("뷰포트 밖이면 자동 전환하지 않는다", () => {
    inViewState.value = false;
    render(<InDepthResearchScreenPreview />);

    advance(10000);
    expect(selectedLabels()).toEqual(["설계 리포트 화면 보기"]);
  });
});
