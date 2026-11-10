import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  boardEmpty: undefined as string | undefined,
}));

vi.mock("@/config/site", () => ({
  site: {
    get boardEmpty() {
      return state.boardEmpty;
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

describe("Faq 빈 안내", () => {
  beforeEach(() => {
    state.boardEmpty = undefined;
  });

  it("위닝은 등록된 질문이 없습니다를 보인다", async () => {
    render(<Faq />);
    expect(
      await screen.findByText("등록된 질문이 없습니다."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 작성된 글이 없어요를 보이고 제목은 FAQ다", async () => {
    state.boardEmpty = "작성된 글이 없어요";
    render(<Faq />);
    expect(await screen.findByText("작성된 글이 없어요")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "FAQ" }),
    ).toBeInTheDocument();
  });

  it("스쿨멘토도 검색 결과 0건 문구는 그대로다", async () => {
    state.boardEmpty = "작성된 글이 없어요";
    render(<Faq />);
    await screen.findByText("작성된 글이 없어요");
    fireEvent.change(screen.getByLabelText("FAQ 키워드 검색"), {
      target: { value: "가나" },
    });
    expect(
      screen.getByText("'가나'에 대한 검색 결과가 없습니다."),
    ).toBeInTheDocument();
  });
});
