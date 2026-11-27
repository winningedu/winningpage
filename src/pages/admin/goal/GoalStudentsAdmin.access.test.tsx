// GoalStudentDetail 쓰기 권한. view 권한이면 온보딩 리셋, 리포트 재발송, 컷 만들기를 감추고 조회는 그대로 둔다.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { TestQueryProvider } from "@/pages/admin/engine/testQuery";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import { GoalStudentDetail } from "./GoalStudentsAdmin";

const reply = (body?: unknown) =>
  Object.assign(Promise.resolve(undefined), { json: async () => body });

const DETAIL = {
  student: {
    profile_id: "student-a",
    school_type: "일반고",
    ideal_university: "서울대",
    ideal_department: "경영",
    ideal_naesin_cut: null,
    ideal_jungsi_cut: 1,
    min_naesin_cut: 1,
    min_jungsi_cut: 1,
  },
  state: { profile_id: "student-a", status: "awaiting_cuts" },
  profile: { id: "student-a", name: "김학생" },
  logs: [],
  cuts: {},
};

beforeEach(() => {
  http.get.mockReset();
  http.get.mockImplementation((url: string) =>
    reply(url.endsWith("/records") ? { items: [], total: 0 } : DETAIL),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDetail(canEdit: boolean) {
  return render(
    <SectionEditAccessProvider value={canEdit}>
      <TestQueryProvider>
        <GoalStudentDetail
          profileId="student-a"
          onBack={() => {}}
          onNavigateWithPrefill={() => {}}
        />
      </TestQueryProvider>
    </SectionEditAccessProvider>,
  );
}

describe("GoalStudentDetail 쓰기 권한", () => {
  it("edit 권한이면 리셋, 재발송, 컷 만들기 버튼이 보인다", async () => {
    renderDetail(true);

    expect(
      await screen.findByRole("button", { name: "온보딩 리셋" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "다시 보내기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "상한 내신 컷 만들기" }),
    ).toBeInTheDocument();
  });

  it("view 권한이면 상세는 보이고 리셋, 재발송, 컷 만들기 버튼은 없다", async () => {
    renderDetail(false);

    await screen.findByRole("heading", { name: /김학생/ });
    expect(screen.queryByRole("button", { name: "온보딩 리셋" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 보내기" })).toBeNull();
    expect(screen.queryByRole("button", { name: /컷 만들기/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "목록으로" }),
    ).toBeInTheDocument();
  });
});
