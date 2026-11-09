// TeacherResetPassword - 스쿨멘토 선생님 비밀번호 찾기(결정 103).
// 아이디와 휴대폰 번호로 본인을 확인한 뒤 새 비밀번호를 직접 정한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeacherResetPassword from "./TeacherResetPassword";

const mockSend = vi.fn();
const mockVerify = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/phoneVerification", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/phoneVerification")>()),
  sendPhoneCode: (...args: unknown[]) => mockSend(...args),
  verifyPhoneCode: (...args: unknown[]) => mockVerify(...args),
}));

function renderTeacher() {
  return render(
    <MemoryRouter>
      <TeacherResetPassword />
    </MemoryRouter>,
  );
}

async function requestCode() {
  fireEvent.change(screen.getByLabelText("아이디"), {
    target: { value: "ABCD2345XY7Z9K" },
  });
  fireEvent.change(screen.getByLabelText("휴대폰 번호"), {
    target: { value: "01012345678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" }));
  const code = await screen.findByLabelText("인증번호");
  await waitFor(() => expect(code).toBeEnabled());
  return code;
}

async function verifyAndReachPasswordStep() {
  renderTeacher();
  const code = await requestCode();
  fireEvent.change(code, { target: { value: "123456" } });
  await screen.findByLabelText("새 비밀번호");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({
    ok: true,
    expiresIn: 180,
    cooldown: 60,
    dryRun: false,
  });
  mockVerify.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => vi.unstubAllGlobals());

describe("TeacherResetPassword 휴대폰 인증", () => {
  it("인증번호 받기는 reset_password 목적으로 번호를 보내고 인증번호 입력을 연다", async () => {
    renderTeacher();

    expect(screen.getByLabelText("인증번호")).toBeDisabled();
    await requestCode();

    expect(mockSend).toHaveBeenCalledWith("01012345678", "reset_password");
    expect(
      screen.getByRole("button", { name: /초 후 다시 보내기/ }),
    ).toBeDisabled();
  });

  it("인증번호 6자리를 채우면 곧바로 검증하고 새 비밀번호 입력을 보여 준다", async () => {
    renderTeacher();
    const code = await requestCode();

    fireEvent.change(code, { target: { value: "123456" } });

    expect(await screen.findByLabelText("새 비밀번호")).toHaveAttribute(
      "placeholder",
      "8자 이상, 영문과 숫자 포함",
    );
    expect(screen.getByLabelText("새 비밀번호 확인")).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledWith(
      "01012345678",
      "123456",
      "reset_password",
    );
  });
});
