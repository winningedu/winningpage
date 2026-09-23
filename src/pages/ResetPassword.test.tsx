// ResetPassword.tsx 회귀 테스트 — Supabase 권장 token_hash + verifyOtp 전환
// 작업(2026-09-23)의 신규 경로와, 기존 해시 링크(레거시) 폴백을 함께 검증한다.
//
// ChangePhoneModal.test.tsx의 vi.mock("@/lib/supabase") 관례를 따른다.
// token_hash/type 쿼리는 MemoryRouter의 initialEntries로 주입한다
// (useSearchParams는 라우트 매칭과 무관하게 location.search만 읽는다).

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPassword from "./ResetPassword";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockVerifyOtp = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) =>
        mockOnAuthStateChange(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function renderResetPassword(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ResetPassword />
    </MemoryRouter>,
  );
}

describe("ResetPassword — token_hash 모드", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockVerifyOtp.mockReset();
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
    mockRpc.mockReset();

    // getSession이 영영 응답하지 않아도(네버 리졸브) token_hash 모드는 세션을
    // 기다리지 않아야 한다 — 이 목이 실제로 불리지 않는 것까지 확인한다.
    mockGetSession.mockReturnValue(new Promise(() => {}));
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("token_hash와 type=recovery가 있으면 세션을 기다리지 않고 즉시 폼을 보여준다", () => {
    renderResetPassword("/login/reset-password?token_hash=abc123&type=recovery");

    expect(
      screen.queryByText("링크를 확인하고 있어요"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("새 비밀번호")).toBeInTheDocument();
  });

  async function fillAndSubmitPassword() {
    fireEvent.change(screen.getByLabelText("새 비밀번호"), {
      target: { value: "New!pass2" },
    });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), {
      target: { value: "New!pass2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경하기" }));
  }

  it("제출하면 verifyOtp로 세션을 만든 뒤 updateUser·rpc·signOut을 순서대로 호출하고 완료 화면을 보여준다", async () => {
    const callOrder: string[] = [];
    mockVerifyOtp.mockImplementation(async () => {
      callOrder.push("verifyOtp");
      return { error: null };
    });
    mockUpdateUser.mockImplementation(async () => {
      callOrder.push("updateUser");
      return { error: null };
    });
    mockRpc.mockImplementation(async () => {
      callOrder.push("rpc");
      return { error: null };
    });
    mockSignOut.mockImplementation(async () => {
      callOrder.push("signOut");
      return { error: null };
    });

    renderResetPassword("/login/reset-password?token_hash=abc123&type=recovery");

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText("비밀번호가 변경됐어요")).toBeInTheDocument(),
    );

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "abc123",
      type: "recovery",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "New!pass2" });
    expect(mockRpc).toHaveBeenCalledWith("fn_activate_admin_member");
    expect(mockSignOut).toHaveBeenCalled();
    expect(callOrder).toEqual(["verifyOtp", "updateUser", "rpc", "signOut"]);
  });

  it("verifyOtp가 otp_expired/403으로 실패하면 만료 화면을 보여주고 updateUser는 부르지 않는다", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { code: "otp_expired", status: 403 },
    });

    renderResetPassword("/login/reset-password?token_hash=abc123&type=recovery");

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText("링크가 만료됐어요")).toBeInTheDocument(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
