import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Pricing from "./Pricing";
import { TITLE } from "./pricing/parentPricingCopy";

// 학부모 회원의 /pricing 진입이 더 이상 차단 모달이 아니라 PricingSelling을
// viewer="parent"로 렌더하는지 검증한다(팀 리드 결정, 2026-09-28).

vi.mock("@/lib/products", () => ({
  useProducts: () => ({
    services: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMatchedTenantIds: () => ({ ids: [] }),
  filterOrgProducts: (services: unknown[]) => services,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useMemberType", () => ({
  useMemberType: vi.fn(),
}));

import { useMemberType } from "@/hooks/useMemberType";

const mockUseMemberType = vi.mocked(useMemberType);

function renderPricingPage() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("Pricing 역할 분기", () => {
  it("parent 회원은 PricingSelling을 viewer=parent로 렌더하고 /mypage로 이동시키지 않는다", () => {
    mockUseMemberType.mockReturnValue({
      loading: false,
      userId: "user-1",
      memberType: "parent",
      error: null,
      refetch: vi.fn(),
    });

    renderPricingPage();

    // PricingSelling 본문(안내 배너 + 상품 선택 h1)이 함께 렌더돼야 한다 —
    // 예전 ParentPricingBlockedModal은 TITLE은 같지만 h1이 없는 빈 화면+모달
    // 이었으므로, h1 존재까지 확인해야 "본문을 대체"가 아니라 "본문 위에
    // 배너만 추가"됐음을 구분할 수 있다.
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "결제할 서비스를 선택해 주세요" }),
    ).toBeInTheDocument();
    // 예전 모달은 dialog role로 렌더됐다 — 더 이상 모달이 아니어야 한다.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith(
      "/mypage",
      expect.anything(),
    );
  });
});
