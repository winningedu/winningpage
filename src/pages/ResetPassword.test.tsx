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
import { PWNED_PASSWORD_MESSAGE } from "@/lib/pwnedPassword";
import ResetPassword from "./ResetPassword";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockVerifyOtp = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();
const mockCheckPwnedPassword = vi.fn();

// 네트워크 조회만 목으로 바꾼다. 메시지와 에러 판별은 실제 모듈을 쓴다.
vi.mock("@/lib/pwnedPassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pwnedPassword")>()),
  checkPwnedPassword: (...args: unknown[]) => mockCheckPwnedPassword(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
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
    mockCheckPwnedPassword.mockReset();
    mockCheckPwnedPassword.mockResolvedValue("ok");

    // getSession이 영영 응답하지 않아도(네버 리졸브) token_hash 모드는 세션을
    // 기다리지 않아야 한다 — 이 목이 실제로 불리지 않는 것까지 확인한다.
    mockGetSession.mockReturnValue(new Promise(() => {}));
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("token_hash와 type=recovery가 있으면 세션을 기다리지 않고 즉시 폼을 보여준다", () => {
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

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

    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

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

  it("재설정을 마치고 로그아웃하면 학습진단 초안만 모두 지운다", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("diagnosis-draft:u2", "{}");
    localStorage.setItem("other-key", "keep");

    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );
    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText("비밀번호가 변경됐어요")).toBeInTheDocument(),
    );
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("diagnosis-draft:u2")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
    localStorage.clear();
  });

  it("verifyOtp가 otp_expired/403으로 실패하면 만료 화면을 보여주고 updateUser는 부르지 않는다", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { code: "otp_expired", status: 403 },
    });

    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText("링크가 만료됐어요")).toBeInTheDocument(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("조회가 실패해도(unknown) 제출을 막지 않는다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("unknown");
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText("비밀번호가 변경됐어요")).toBeInTheDocument(),
    );
  });

  it("저장 때 Supabase가 유출된 비밀번호라고 거절하면 같은 입력칸에 같은 안내를 보여준다", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({
      error: {
        code: "weak_password",
        name: "AuthWeakPasswordError",
        reasons: ["pwned"],
      },
    });
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("새 비밀번호 입력칸을 벗어났을 때 유출된 비밀번호면 그 칸 아래에 안내를 보여준다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("pwned");
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    const field = screen.getByLabelText("새 비밀번호");
    fireEvent.change(field, { target: { value: "New!pass2" } });
    expect(mockCheckPwnedPassword).not.toHaveBeenCalled();
    fireEvent.blur(field);

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("입력칸을 벗어나지 않고 바로 제출해도 유출된 비밀번호면 막고 토큰도 쓰지 않는다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("pwned");
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    await fillAndSubmitPassword();

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("조회 중에 비밀번호를 바꿔도 조회가 유출로 끝나면 토큰을 쓰지 않고 저장도 하지 않는다", async () => {
    let resolveLookup: (value: "pwned") => void = () => {};
    mockCheckPwnedPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    renderResetPassword(
      "/login/reset-password?token_hash=abc123&type=recovery",
    );

    await fillAndSubmitPassword();
    await waitFor(() => expect(mockCheckPwnedPassword).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("새 비밀번호"), {
      target: { value: "Other!pass3" },
    });
    resolveLookup("pwned");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "비밀번호 변경하기" }),
      ).toBeInTheDocument(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe("ResetPassword — 레거시(해시 링크) 폴백", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockVerifyOtp.mockReset();
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
    mockRpc.mockReset();
    mockCheckPwnedPassword.mockReset();
    mockCheckPwnedPassword.mockResolvedValue("ok");
    window.location.hash = "";
  });

  it("token_hash가 없고 PASSWORD_RECOVERY 이벤트가 오면 폼을 보여준다(관리자 초대 링크 경로)", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    let onAuthStateChangeCallback: ((event: string) => void) | undefined;
    mockOnAuthStateChange.mockImplementation((callback) => {
      onAuthStateChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    renderResetPassword("/login/reset-password");

    expect(screen.getByText("링크를 확인하고 있어요")).toBeInTheDocument();

    onAuthStateChangeCallback?.("PASSWORD_RECOVERY");

    await waitFor(() =>
      expect(screen.getByLabelText("새 비밀번호")).toBeInTheDocument(),
    );
  });

  it("해시에 error_code=otp_expired가 있으면 4초를 기다리지 않고 즉시 만료 화면을 보여준다", () => {
    vi.useFakeTimers();
    try {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      });
      window.location.hash =
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

      renderResetPassword("/login/reset-password");

      // 4초 타이머를 전혀 진행시키지 않았는데도(advance 없음) 이미 만료
      // 화면이어야 한다 — 마운트 시 해시를 즉시 판정하기 때문이다.
      expect(screen.getByText("링크가 만료됐어요")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
