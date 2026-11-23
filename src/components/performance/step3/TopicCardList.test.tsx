import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import TopicCardList from "./TopicCardList";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(trackEvent).mockClear();
});

const REGENERATE = "다른 주제 1번 더 추천받기";

describe("TopicCardList 재추천 이벤트", () => {
  it("재추천을 누르면 onRegenerate와 ai_regenerate를 topics로 보낸다", () => {
    const onRegenerate = vi.fn();
    render(
      <TopicCardList round={1} maxRounds={2} onRegenerate={onRegenerate} />,
    );

    fireEvent.click(screen.getByRole("button", { name: REGENERATE }));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("ai_regenerate", {
      service: "performance",
      step: "topics",
    });
  });

  it("진행 중이면 요청도 이벤트도 보내지 않는다", () => {
    const onRegenerate = vi.fn();
    render(
      <TopicCardList
        round={1}
        maxRounds={2}
        regenerating
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: REGENERATE }));

    expect(onRegenerate).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("라운드를 다 썼으면 요청도 이벤트도 보내지 않는다", () => {
    const onRegenerate = vi.fn();
    render(
      <TopicCardList round={2} maxRounds={2} onRegenerate={onRegenerate} />,
    );

    fireEvent.click(screen.getByRole("button", { name: REGENERATE }));

    expect(onRegenerate).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
