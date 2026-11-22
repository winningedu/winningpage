// 성장 리포트 복구 다이얼로그. 복구 요청이 진행 중일 때는 Esc 와 바깥 누름으로 닫히지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./growthReportsApi", () => ({
  fetchGrowthReports: vi.fn(),
  postGrowthGrant: vi.fn(),
  postGrowthRecover: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({}) },
}));

import GrowthReportsAdmin from "./GrowthReportsAdmin";
import * as api from "./growthReportsApi";

const ITEM = {
  id: "s-1",
  profileId: "p-1",
  studentName: "김학생",
  email: "kim@example.com",
  status: "archived",
  currentStep: 6,
  ledgerId: null,
  ledgerReversedAt: null,
  lastActivityAt: null,
  terminal: {
    reason: "generation_failed",
    step: 3,
    at: "2026-10-07T01:00:00Z",
  },
  progress: [],
  track: "인문",
  issuedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchGrowthReports).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  } as never);
  vi.mocked(api.postGrowthRecover).mockReturnValue(new Promise(() => {}));
});

async function startRecover() {
  render(<GrowthReportsAdmin config={{ title: "성장 리포트" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "김학생" }));
  await screen.findByRole("dialog", { name: /김학생/ });
  fireEvent.click(screen.getByRole("button", { name: "실패 회차 복구" }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await screen.findByRole("button", { name: "처리 중..." });
}

describe("GrowthReportsAdmin 복구 다이얼로그", () => {
  test("복구 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    await startRecover();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });

  test("복구 요청이 진행 중일 때 바깥을 눌러도 닫히지 않는다", async () => {
    await startRecover();

    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.mouseDown(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });
});
