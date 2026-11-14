import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  boardBanners: undefined as
    | undefined
    | Record<
        "faq" | "info",
        { src: string; alt: string; width: number; height: number }
      >,
}));

vi.mock("@/config/site", () => ({
  site: {
    get boardBanners() {
      return state.boardBanners;
    },
  },
}));
vi.mock("@/lib/supabase", () => {
  const makeChain = (): Promise<{ data: never[]; error: null }> =>
    Object.assign(Promise.resolve({ data: [], error: null }), {
      select: makeChain,
      eq: makeChain,
      order: makeChain,
    });
  return { supabase: { from: makeChain } };
});

import Faq from "./Faq";

const FAQ_ALT = "궁금한 점, 여기서 바로 해결하세요";

describe("Faq 상단 배너", () => {
  beforeEach(() => {
    state.boardBanners = undefined;
  });

  it("위닝은 배너 이미지를 렌더하지 않는다", async () => {
    render(<Faq />);
    await screen.findByText("등록된 질문이 없습니다.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("스쿨멘토는 제목 위에 배너를 크기 속성과 함께 렌더한다", async () => {
    state.boardBanners = {
      faq: {
        src: "/images/faq-banner.png",
        alt: FAQ_ALT,
        width: 2400,
        height: 720,
      },
      info: {
        src: "/images/info-banner.png",
        alt: "다른 배너",
        width: 2400,
        height: 720,
      },
    };
    render(<Faq />);
    await screen.findByText("등록된 질문이 없습니다.");
    const banner = screen.getByRole("img", { name: FAQ_ALT });
    expect(banner).toHaveAttribute("src", "/images/faq-banner.png");
    expect(banner).toHaveAttribute("width", "2400");
    expect(banner).toHaveAttribute("height", "720");
    expect(banner).toHaveAttribute("loading", "eager");
    const heading = screen.getByRole("heading", { level: 1, name: "FAQ" });
    expect(
      banner.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
