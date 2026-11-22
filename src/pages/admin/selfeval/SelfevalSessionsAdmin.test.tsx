import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./selfevalSessionsApi", () => ({
  fetchSelfevalSessions: vi.fn(),
  fetchSelfevalSessionDetail: vi.fn(),
  postSelfevalGrant: vi.fn(),
  postSelfevalRecover: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import SelfevalSessionsAdmin from "./SelfevalSessionsAdmin";
import * as api from "./selfevalSessionsApi";
import type { SelfevalSessionItem } from "./selfevalSessionsRow";

const ITEM: SelfevalSessionItem = {
  id: "s-1",
  profileId: "p-1",
  studentName: "최학생",
  email: "choi@example.com",
  status: "completed",
  currentStep: 6,
  academicYear: 2026,
  semester: 1,
  area: null,
  subject: "국어",
  activityName: null,
  regenerateCount: 0,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  progress: [],
  lastActivityAt: null,
  completedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchSelfevalSessions).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  });
  vi.mocked(api.fetchSelfevalSessionDetail).mockReturnValue(
    new Promise(() => {}),
  );
});

describe("SelfevalSessionsAdmin 목록", () => {
  test("첫 칸의 버튼을 눌러 세션 상세를 연다", async () => {
    render(<SelfevalSessionsAdmin config={{ title: "자기평가" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "최학생" }));

    expect(
      await screen.findByRole("dialog", { name: /최학생 \(완료\)/ }),
    ).toBeInTheDocument();
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    render(<SelfevalSessionsAdmin config={{ title: "자기평가" }} />);
    const header = await screen.findByRole("columnheader", { name: "학생" });
    expect(header).toHaveAttribute("scope", "col");
  });
});
