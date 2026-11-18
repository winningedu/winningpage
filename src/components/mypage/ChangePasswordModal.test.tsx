import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PWNED_PASSWORD_MESSAGE } from "@/lib/pwnedPassword";
import ChangePasswordModal from "./ChangePasswordModal";

// ChangePhoneModal.test.tsx 의 vi.mock("@/lib/supabase") 관례를 따른다.
// 네트워크 조회(checkPwnedPassword)만 목으로 바꾸고 메시지와 에러 판별은 실제 모듈을 쓴다.
const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockCheckPwnedPassword = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}));

vi.mock("@/lib/pwnedPassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pwnedPassword")>()),
  checkPwnedPassword: (...args: unknown[]) => mockCheckPwnedPassword(...args),
}));

function renderModal() {
  return render(
    <ChangePasswordModal open email="user@example.com" onClose={() => {}} />,
  );
}

function fillForm() {
  fireEvent.change(
    screen.getByPlaceholderText("현재 비밀번호를 입력해주세요"),
    {
      target: { value: "Old!pass1" },
    },
  );
  fireEvent.change(screen.getByPlaceholderText("새 비밀번호 입력"), {
    target: { value: "New!pass2" },
  });
}

describe("ChangePasswordModal: 유출된 비밀번호 확인", () => {
  beforeEach(() => {
    for (const mock of [
      mockGetUser,
      mockSignInWithPassword,
      mockUpdateUser,
      mockSignOut,
      mockCheckPwnedPassword,
    ]) {
      mock.mockReset();
    }
    mockCheckPwnedPassword.mockResolvedValue("ok");
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@example.com" } },
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("새 비밀번호 입력칸을 벗어났을 때 유출된 비밀번호면 그 칸 아래에 안내를 보여준다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("pwned");
    renderModal();

    fillForm();
    expect(mockCheckPwnedPassword).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByPlaceholderText("새 비밀번호 입력"));

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
  });
});
