import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
    sort_order: number;
    is_active: boolean;
  }>,
}));

vi.mock("@/config/site", () => ({ site: {} }));
vi.mock("@/lib/supabase", () => {
  const makeChain = (): Promise<{ data: unknown[]; error: null }> =>
    Object.assign(Promise.resolve({ data: state.rows, error: null }), {
      select: makeChain,
      eq: makeChain,
      order: makeChain,
    });
  return { supabase: { from: makeChain } };
});

import { FAQ_CATEGORIES } from "@/data/faqCategories";
import { boardConfigs } from "@/pages/admin/configs/board";
import Faq from "./Faq";

const row = (category: string, index: number) => ({
  id: `id-${index}`,
  question: `질문 ${index}`,
  answer: "답변",
  category,
  sort_order: index,
  is_active: true,
});

const tabNames = async () =>
  (await screen.findAllByRole("tab")).map((tab) => tab.textContent);

describe("Faq 카테고리 탭", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("선생님 계정 행이 있으면 요금제 및 결제 탭 다음에 탭이 생긴다", async () => {
    state.rows = [
      row("선생님 계정", 1),
      row("요금제 및 결제", 2),
      row("서비스 이용 방법", 3),
      row("회원가입 및 이용환경", 4),
    ];
    render(<Faq />);
    await screen.findByText("질문 1");
    expect(await tabNames()).toEqual([
      "전체",
      "회원가입 및 이용환경",
      "서비스 이용 방법",
      "요금제 및 결제",
      "선생님 계정",
    ]);
  });

  it("선생님 계정 행이 없으면(위닝) 탭이 생기지 않는다", async () => {
    state.rows = [row("서비스 이용 방법", 1), row("요금제 및 결제", 2)];
    render(<Faq />);
    await screen.findByText("질문 1");
    expect(await tabNames()).toEqual([
      "전체",
      "서비스 이용 방법",
      "요금제 및 결제",
    ]);
  });

  it("관리자 카테고리 선택지에 선생님 계정이 있다", () => {
    const field = boardConfigs.faqs.fields.find((f) => f.key === "category");
    expect(field?.options).toEqual(FAQ_CATEGORIES);
    expect(field?.options).toContain("선생님 계정");
  });
});
