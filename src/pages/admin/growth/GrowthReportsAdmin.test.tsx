import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./growthReportsApi", () => ({
  fetchGrowthReports: vi.fn(),
  postGrowthGrant: vi.fn(),
  postGrowthRecover: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import GrowthReportsAdmin from "./GrowthReportsAdmin";
import * as api from "./growthReportsApi";
import type { GrowthReportItem } from "./growthReportsRow";

const ITEM: GrowthReportItem = {
  id: "r-1",
  profileId: "p-1",
  studentName: "박학생",
  email: "park@example.com",
  status: "completed",
  currentStep: 8,
  track: "인문",
  issuedAt: null,
  lastActivityAt: null,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  progress: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchGrowthReports).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  });
});

describe("GrowthReportsAdmin 목록", () => {
  test("첫 칸의 버튼을 눌러 회차 상세를 연다", async () => {
    render(<GrowthReportsAdmin config={{ title: "성장 리포트" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "박학생" }));

    expect(
      await screen.findByRole("dialog", { name: /박학생 \(완료\)/ }),
    ).toBeInTheDocument();
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    render(<GrowthReportsAdmin config={{ title: "성장 리포트" }} />);
    const header = await screen.findByRole("columnheader", { name: "학생" });
    expect(header).toHaveAttribute("scope", "col");
  });
});
