import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangeEmailModal from "./ChangeEmailModal";

const authEmail = vi.hoisted(() => ({ current: "old@example.com" }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { email: authEmail.current } } }),
      signInWithPassword: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      verifyOtp: async () => {
        authEmail.current = "new@example.com";
        return { error: null };
      },
      signOut: async () => ({ error: null }),
    },
  },
}));

beforeEach(() => {
  localStorage.clear();
  authEmail.current = "old@example.com";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: vi.fn() },
  });
});

describe("ChangeEmailModal 학습진단 초안", () => {
  it("이메일 변경 뒤 재로그인하면 학습진단 초안을 지우고 다른 키는 둔다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("other-key", "keep");
    render(<ChangeEmailModal open onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("example@email.com"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("본인 확인을 위해 비밀번호를 입력해주세요"),
      { target: { value: "pw" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "인증번호 보내기" }));
    fireEvent.change(
      await screen.findByPlaceholderText(
        "이메일로 보낸 인증번호를 입력해주세요",
      ),
      { target: { value: "123456" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "변경하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "변경할게요" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "다시 로그인하기" }),
    );

    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
