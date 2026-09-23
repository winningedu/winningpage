// FindPassword.tsx 이메일 링크 경로 회귀 테스트 — token_hash 전환 작업(A3·A4,
// 2026-09-23)의 429 판정과 유효 시간 안내를 검증한다.
//
// 휴대폰 인증 탭(기본 선택)은 건드리지 않는다 — 이 파일은 "이메일 링크" 탭으로
// 전환한 뒤의 발송 흐름만 다룬다. ChangePhoneModal.test.tsx의 vi.mock("@/lib/supabase")
// 관례를 따른다. useSignupEnabled가 내부적으로 appSettings를 조회하므로 그쪽도
// 함께 모킹한다(이 화면과 무관한 값이라 null로 고정).

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FindPassword from "./FindPassword";

const mockResetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) =>
        mockResetPasswordForEmail(...args),
    },
  },
}));

vi.mock("@/lib/appSettings", () => ({
  getAppSettingBool: vi.fn().mockResolvedValue(null),
}));

function renderFindPassword() {
  render(
    <MemoryRouter>
      <FindPassword />
    </MemoryRouter>,
  );
}

async function switchToEmailTabAndSubmit(email: string) {
  fireEvent.click(screen.getByRole("tab", { name: "이메일 링크" }));
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }));
}

describe("FindPassword — 이메일 링크 발송(A3 429 판정 / A4 유효 시간 안내)", () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
  });

  it("발송 한도 초과(429)면 실패 문구를 보여주고 쿨다운을 걸지 않는다", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { status: 429, code: "over_email_send_rate_limit" },
    });
    renderFindPassword();

    await switchToEmailTabAndSubmit("student@example.com");

    await waitFor(() =>
      expect(
        screen.getByText(
          "요청이 많아 지금은 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.",
        ),
      ).toBeInTheDocument(),
    );

    // 쿨다운이 걸리지 않았으므로 버튼 문구가 여전히 "재설정 링크 보내기"다.
    expect(
      screen.getByRole("button", { name: "재설정 링크 보내기" }),
    ).toBeInTheDocument();
  });

  it("정상 발송되면 30분 유효 안내를 포함한 성공 문구를 보여준다", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    renderFindPassword();

    await switchToEmailTabAndSubmit("student@example.com");

    await waitFor(() =>
      expect(
        screen.getByText(
          "입력하신 이메일로 비밀번호 재설정 링크를 보냈어요. 링크는 30분간 유효해요. 메일함(스팸함 포함)을 확인해 주세요.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
