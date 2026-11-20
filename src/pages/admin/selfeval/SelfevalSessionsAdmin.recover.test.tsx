// 자기평가 복구 다이얼로그. 복구 요청이 진행 중일 때는 Esc 와 바깥 누름으로 닫히지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./selfevalSessionsApi", () => ({
  fetchSelfevalSessions: vi.fn(),
  postSelfevalGrant: vi.fn(),
  postSelfevalRecover: vi.fn(),
  fetchSelfevalSessionDetail: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({}) },
}));

import SelfevalSessionsAdmin from "./SelfevalSessionsAdmin";
import * as api from "./selfevalSessionsApi";

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
    step: "3",
    at: "2026-10-07T01:00:00Z",
  },
  progress: [],
  academicYear: 2026,
  semester: 1,
  area: null,
  subject: "국어",
  activityName: null,
  regenerateCount: 0,
  completedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchSelfevalSessions).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  } as never);
  vi.mocked(api.fetchSelfevalSessionDetail).mockReturnValue(
    new Promise(() => {}),
  );
  vi.mocked(api.postSelfevalRecover).mockReturnValue(new Promise(() => {}));
});

async function startRecover() {
  render(<SelfevalSessionsAdmin config={{ title: "자기평가" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "김학생" }));
  await screen.findByRole("dialog", { name: /김학생/ });
  fireEvent.click(screen.getByRole("button", { name: "실패 세션 복구" }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await screen.findByRole("button", { name: "처리 중..." });
}

describe("SelfevalSessionsAdmin 복구 다이얼로그", () => {
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
