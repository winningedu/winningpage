import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      {
        title: "목표성장서비스",
        to: "/services",
        items: [{ label: "학습진단", to: "/services/learning-diagnosis" }],
      },
    ],
  };
});

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    logo: { horizontal: "/images/schoolmentor-logo-horizontal.png" },
  },
}));

vi.mock("@/hooks/useSignupEnabled", () => ({
  useSignupEnabled: () => true,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
    rpc: async () => ({ data: [], error: null }),
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("b2b Header 게스트 상태", () => {
  it("로그인과 선생님 버튼이 /login 으로 가고 회원가입은 없다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "선생님" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("회원가입")).not.toBeInTheDocument();
  });
});
