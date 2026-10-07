import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import CompanyNews from "./CompanyNews";

// 쿼리 체인의 어느 지점에서 await 해도 빈 결과가 나오게 하는 Promise 기반 체인.
vi.mock("@/lib/supabase", () => {
  const makeChain = (): Promise<{ data: null; error: null }> =>
    Object.assign(Promise.resolve({ data: null, error: null }), {
      select: makeChain,
      eq: makeChain,
      order: makeChain,
      maybeSingle: makeChain,
    });
  return { supabase: { from: makeChain } };
});

describe("CompanyNews 히어로 서비스 카드", () => {
  test("성장설계 카드는 /services/growth 링크로 렌더된다", () => {
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );
    const link = screen.getByText("성장설계").closest("a");
    expect(link?.getAttribute("href")).toBe("/services/growth");
  });
});
