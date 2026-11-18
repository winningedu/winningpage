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

async function confirmChange() {
  fireEvent.click(screen.getByRole("button", { name: "변경하기" }));
  fireEvent.click(await screen.findByRole("button", { name: "변경할게요" }));
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

  it("입력칸을 벗어나지 않고 바로 제출해도 유출된 비밀번호면 현재 비밀번호 확인 없이 입력 단계로 돌려보낸다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("pwned");
    renderModal();

    fillForm();
    await confirmChange();

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("조회가 실패해도(unknown) 변경을 막지 않는다", async () => {
    mockCheckPwnedPassword.mockResolvedValue("unknown");
    renderModal();

    fillForm();
    await confirmChange();

    await waitFor(() =>
      expect(screen.getByText("변경이 완료됐어요")).toBeInTheDocument(),
    );
  });

  it("저장 때 Supabase가 유출된 비밀번호라고 거절하면 같은 입력칸에 같은 안내를 보여준다", async () => {
    mockUpdateUser.mockResolvedValue({
      error: {
        code: "weak_password",
        name: "AuthWeakPasswordError",
        reasons: ["pwned"],
      },
    });
    renderModal();

    fillForm();
    await confirmChange();

    await waitFor(() =>
      expect(screen.getByText(PWNED_PASSWORD_MESSAGE)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
      ),
    ).not.toBeInTheDocument();
  });
});
