import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { postSessionMock } = vi.hoisted(() => ({ postSessionMock: vi.fn() }));

vi.mock("@/lib/inquiry/api", () => ({
  postSession: postSessionMock,
  fetchReports: vi.fn(),
  fetchSessionDetail: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "QA학생" }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));

vi.mock("@/components/Header", () => ({
  default: () => <header data-testid="site-header" />,
}));
vi.mock("@/components/ui/RouteLoadingOverlay", () => ({
  default: () => null,
}));

import InquiryAppLayout from "./InquiryAppLayout";
import { useInquiryScreenStep } from "./InquiryShellContext";

function StepOneChild() {
  useInquiryScreenStep(1);
  return <div>child</div>;
}

beforeEach(() => {
  postSessionMock.mockReset();
  postSessionMock.mockResolvedValue({
    kind: "ok",
    data: {
      ok: true,
      session: null,
      profile: { gradeLabel: "고2", semester: 2, career: null },
      quota: {
        quotaTotal: 10,
        quotaUsed: 3,
        quotaRemaining: 7,
        planEndsAt: null,
        planLabel: null,
      },
      handoff: null,
      records: [],
      subjectCounts: [],
      assets: [],
      topics: [],
      gradeNote: null,
      replyResent: false,
    },
  });
});

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/inquiry"]}>
        <Routes>
          <Route element={<InquiryAppLayout />}>
            <Route path="/app/inquiry" element={<StepOneChild />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InquiryAppLayout 렌더 스모크", () => {
  test("헤더, 사이드바, 페이지, 하단 고지를 함께 그린다", () => {
    renderLayout();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "꼭 알아 두세요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("진행단계")).toBeInTheDocument();
  });

  test("부트스트랩이 오면 사이드바에 이름과 학년이 뜨고 정보 입력이 현재 단계다", async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText("QA학생의 심화탐구")).toBeInTheDocument(),
    );
    expect(screen.getByText("고2")).toBeInTheDocument();
    const current = document.querySelector('li[aria-current="step"]');
    expect(current?.textContent).toContain("정보 입력");
  });
});
