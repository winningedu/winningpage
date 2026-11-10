// 마이페이지의 학적 두 조각(입력 안내, 내 정보 학년/반/번호 행)은 학적을 한 번만 읽어 같이 쓴다(사 #109, #110).

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyPage from "./MyPage";

const mockApiFetch = vi.fn();

vi.mock("@/config/site", () => ({
  site: { features: { studentEnrollment: true }, company: {} },
}));

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

let mockProfile: Record<string, unknown> = {
  id: "student-1",
  name: "학생",
  member_type: "student",
};
vi.mock("./mypage/useMyPageProfile", () => ({
  useMyPageProfile: () => ({
    user: { id: "student-1", email: "s@example.com" },
    profile: mockProfile,
    loading: false,
  }),
}));
vi.mock("./mypage/useMyPageOrders", () => ({
  useMyPageOrders: () => ({ orders: [], refunds: [], reload: () => {} }),
}));
vi.mock("./mypage/usePendingOrderCount", () => ({
  usePendingOrderCount: () => ({ pendingOrderCount: 0, reload: () => {} }),
}));

// 프로필 탭이 읽는 supabase 호출은 모두 빈 결과로 답한다.
vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = async () => ({ data: null, error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        // JoinTenantModal 이 불러오는 queryClient 가 모듈 로드 때 구독한다.
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
    },
  };
});

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

const me = (className: string | null, number: number | null) => ({
  ok: true,
  orgType: "학교",
  enrollment: {
    schoolYear: 2026,
    grade: "고3",
    groupName: null,
    className,
    number,
  },
  pending: null,
});

beforeEach(() => {
  mockApiFetch.mockReset();
  mockProfile = { id: "student-1", name: "학생", member_type: "student" };
});

describe("MyPage 학적", () => {
  it("학적을 한 번만 읽고, 반과 번호를 입력하면 내 정보 행도 새 반으로 바뀐다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(200, me(null, null)))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, me("5", 12)));
    render(
      <MemoryRouter initialEntries={["/mypage?tab=profile"]}>
        <MyPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("고3 반 미정")).toBeInTheDocument();
    expect(
      mockApiFetch.mock.calls.filter((c) => c[0] === "/api/enrollment/me"),
    ).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("반"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("번호"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(screen.getByText("고3 5반 12번")).toBeInTheDocument(),
    );
  });
});

describe("MyPage 회원 유형별 탭", () => {
  function renderMyPage() {
    return render(
      <MemoryRouter initialEntries={["/mypage?tab=profile"]}>
        <MyPage />
      </MemoryRouter>,
    );
  }

  it("학부모는 자녀 등록 및 수정 탭을 본다", () => {
    mockProfile = { id: "p1", name: "학부모", member_type: "parent" };
    renderMyPage();

    expect(screen.getAllByText(/자녀 등록 및 수정/).length).toBeGreaterThan(0);
  });

  it("member_type이 parent여도 관리자는 학부모 탭을 보지 않는다", () => {
    mockProfile = {
      id: "a1",
      name: "관리자",
      member_type: "parent",
      role: "admin",
    };
    renderMyPage();

    expect(screen.queryByText(/자녀 등록 및 수정/)).not.toBeInTheDocument();
  });
});
