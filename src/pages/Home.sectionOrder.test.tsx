import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import Home from "./Home";

// 테이블별 행을 돌려주는 Promise 기반 쿼리 체인(어느 지점에서 await 해도 결과가 나온다).
const rowsByTable: Record<string, unknown[]> = {
  program_categories: [
    {
      id: "svc-1",
      name: "학습진단",
      description: "무료로 경험하는\n위닝 AE시스템",
      link: "/services/learning-diagnosis",
      icon_image_url: "/images/landing/services/learning-diagnosis.png",
      sort_order: 1,
    },
  ],
  university_acceptances: [
    { id: "u-1", name: "서울대학교", track: "general", sort_order: 1 },
  ],
};

vi.mock("@/lib/supabase", () => {
  const makeChain = (table: string): Promise<{ data: unknown; error: null }> =>
    Object.assign(
      Promise.resolve({ data: rowsByTable[table] ?? [], error: null }),
      {
        select: () => makeChain(table),
        eq: () => makeChain(table),
        or: () => makeChain(table),
        order: () => makeChain(table),
        limit: () => makeChain(table),
      },
    );
  return { supabase: { from: (table: string) => makeChain(table) } };
});

vi.mock("@/hooks/useHomeMentors", () => ({
  useHomeMentors: () => ({ mentors: [] }),
}));

describe("Home 섹션 순서", () => {
  test("핵심 서비스 섹션이 합격생 섹션보다 먼저 나온다", async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    const services = await screen.findByRole("region", { name: "핵심 서비스" });
    const acceptance = await screen.findByRole("region", { name: "합격생" });
    expect(
      services.compareDocumentPosition(acceptance) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
