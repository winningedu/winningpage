import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WithdrawModal from "./WithdrawModal";

vi.mock("@/lib/apiFetch", () => ({
  apiFetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: async () => ({ error: null }) } },
}));

beforeEach(() => {
  localStorage.clear();
});

describe("WithdrawModal 학습진단 초안", () => {
  it("탈퇴가 끝나면 이 기기의 학습진단 초안을 지우고 다른 키는 둔다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("other-key", "keep");
    render(<WithdrawModal open />);

    fireEvent.click(screen.getByText("서비스를 자주 이용하지 않아서"));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴 진행" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));

    await screen.findByText("탈퇴가 완료됐어요");
    await waitFor(() =>
      expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull(),
    );
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
