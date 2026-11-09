// TeacherResetPassword - 스쿨멘토 선생님 비밀번호 찾기(결정 103).
// 아이디와 휴대폰 번호로 본인을 확인한 뒤 새 비밀번호를 직접 정한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeacherResetPassword from "./TeacherResetPassword";

const mockSend = vi.fn();
const mockVerify = vi.fn();
const mockFetch = vi.fn();

const SAVE_FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요";

vi.mock("@/lib/phoneVerification", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/phoneVerification")>()),
  sendPhoneCode: (...args: unknown[]) => mockSend(...args),
  verifyPhoneCode: (...args: unknown[]) => mockVerify(...args),
}));

function renderTeacher() {
  return render(
    <MemoryRouter initialEntries={["/login/find-password"]}>
      <Routes>
        <Route path="/login/find-password" element={<TeacherResetPassword />} />
        <Route path="/login" element={<p>로그인 화면</p>} />
      </Routes>
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

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

function fillPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("새 비밀번호"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
}

function expectFirstStep() {
  expect(screen.getByLabelText("아이디")).toBeEnabled();
  expect(screen.getByLabelText("휴대폰 번호")).toBeEnabled();
  expect(screen.getByLabelText("인증번호")).toBeDisabled();
  expect(screen.getByLabelText("인증번호")).toHaveValue("");
  expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
  expect(screen.queryByLabelText("새 비밀번호 확인")).toBeNull();
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

describe("TeacherResetPassword 새 비밀번호", () => {
  it("성공하면 아이디와 번호와 비밀번호를 보내고 로그인 안내를 보여 준다", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await verifyAndReachPasswordStep();

    fillPasswords("NewPass123", "NewPass123");

    expect(
      await screen.findByText(
        "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/teacher-reset-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      loginId: "ABCD2345XY7Z9K",
      phone: "01012345678",
      password: "NewPass123",
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인하러 가기" }));
    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
  });

  it("규칙에 맞지 않는 비밀번호는 서버로 보내지 않고 규칙 문구를 보여 준다", async () => {
    await verifyAndReachPasswordStep();

    fillPasswords("onlyletters", "onlyletters");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "8자 이상, 영문과 숫자를 함께 써 주세요",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("확인 비밀번호가 다르면 서버로 보내지 않고 불일치 문구를 보여 준다", async () => {
    await verifyAndReachPasswordStep();

    fillPasswords("NewPass123", "NewPass124");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "새 비밀번호가 서로 다릅니다.",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TEACHER_NOT_MATCHED 는 서버 문구를 보여 주고 인증과 입력한 비밀번호를 유지한 채 아이디를 고쳐 다시 보낼 수 있다", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            code: "TEACHER_NOT_MATCHED",
            message: "아이디와 휴대폰 번호를 다시 확인해 주세요.",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await verifyAndReachPasswordStep();

    fillPasswords("NewPass123", "NewPass123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "아이디와 휴대폰 번호를 다시 확인해 주세요.",
    );
    expect(screen.getByLabelText("새 비밀번호")).toHaveValue("NewPass123");
    expect(screen.getByLabelText("새 비밀번호 확인")).toHaveValue("NewPass123");
    expect(screen.getByLabelText("아이디")).toBeEnabled();

    fireEvent.change(screen.getByLabelText("아이디"), {
      target: { value: "ZZZZ2345XY7Z9K" },
    });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));

    expect(
      await screen.findByText(
        "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls[1]?.[1].body)).toMatchObject({
      loginId: "ZZZZ2345XY7Z9K",
      phone: "01012345678",
    });
  });

  it("처음부터 다시를 누르면 안내 없이 첫 단계로 돌아가고 비밀번호 입력을 지운다", async () => {
    await verifyAndReachPasswordStep();
    fireEvent.change(screen.getByLabelText("새 비밀번호"), {
      target: { value: "NewPass123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "처음부터 다시" }));

    expectFirstStep();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("처음부터 다시 뒤에도 60초 재전송 대기는 남아 있고 번호는 고쳐 쓸 수 있다", async () => {
    await verifyAndReachPasswordStep();

    fireEvent.click(screen.getByRole("button", { name: "처음부터 다시" }));

    expect(
      screen.getByRole("button", { name: /초 후 다시 보내기/ }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("휴대폰 번호"), {
      target: { value: "01099998888" },
    });
    expect(screen.getByLabelText("휴대폰 번호")).toHaveValue("01099998888");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("PASSWORD_CHANGED_REVOKE_FAILED 는 바뀐 비밀번호로 보고 안내와 로그인 버튼을 보여 준다", async () => {
    const message =
      "비밀번호는 바뀌었어요. 다른 기기의 로그인은 끊지 못했으니 새 비밀번호로 로그인한 뒤 마이페이지에서 비밀번호를 한 번 더 바꿔 주세요.";
    mockFetch.mockResolvedValueOnce(
      jsonResponse(500, {
        error: { code: "PASSWORD_CHANGED_REVOKE_FAILED", message },
      }),
    );
    await verifyAndReachPasswordStep();

    fillPasswords("NewPass123", "NewPass123");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그인하러 가기" }));
    expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
  });
});
