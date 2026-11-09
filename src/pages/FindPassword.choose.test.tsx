// FindPassword.tsx 휴대폰 경로 - 스쿨멘토는 chooseAccount 를 보내고 409 choose_account 면
// 계정을 고르게 한 뒤 임시비밀번호를 보여준다. 위닝은 새 필드를 보내지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FindPassword from "./FindPassword";

const state = vi.hoisted(() => ({ siteKey: "schoolmentor" }));
const mockFetch = vi.fn();

vi.mock("@/config/site", () => ({
  site: {
    get key() {
      return state.siteKey;
    },
  },
}));

vi.mock("@/hooks/useSignupEnabled", () => ({ useSignupEnabled: () => false }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));

vi.mock("@/lib/phoneVerification", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/phoneVerification")>()),
  sendPhoneCode: async () => ({
    ok: true,
    expiresIn: 180,
    cooldown: 60,
    dryRun: false,
  }),
  verifyPhoneCode: async () => ({ ok: true }),
}));

const chooseResponse = {
  status: 409,
  ok: false,
  json: async () => ({
    ok: false,
    code: "choose_account",
    accounts: [
      { accountId: "p1", maskedId: "kim*****", tenantName: "한빛중학교" },
      { accountId: "p2", maskedId: "abc*", tenantName: "새봄학원" },
    ],
  }),
};

const successResponse = {
  status: 200,
  ok: true,
  json: async () => ({
    ok: true,
    found: true,
    temp_password: "Tmp#pass9",
    masked_email: "ab****@ex***.com",
    via: "phone",
  }),
};

function requestBody(call: number) {
  return JSON.parse(mockFetch.mock.calls[call]?.[1]?.body as string);
}

async function verifyPhone() {
  render(
    <MemoryRouter>
      <FindPassword />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("전화번호"), {
    target: { value: "01012345678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "인증번호 보내기" }));
  const code = await screen.findByLabelText("인증번호");
  await waitFor(() => expect(code).toBeEnabled());
  fireEvent.change(code, { target: { value: "123456" } });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => vi.unstubAllGlobals());

const changedResponse = {
  status: 200,
  ok: true,
  json: async () => ({
    ok: true,
    found: true,
    masked_email: "ab****@ex***.com",
    via: "phone",
  }),
};

const NEW_PASSWORD = "NewPass123!";

async function submitNewPassword(password = NEW_PASSWORD, confirm = password) {
  fireEvent.change(await screen.findByLabelText("새 비밀번호"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
}

describe("FindPassword 스쿨멘토 새 비밀번호 직접 정하기", () => {
  it("인증이 끝나면 요청 없이 새 비밀번호 입력 칸과 규칙 안내를 보여준다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();

    expect(await screen.findByLabelText("새 비밀번호")).toBeInTheDocument();
    expect(screen.getByLabelText("새 비밀번호 확인")).toBeInTheDocument();
    expect(
      screen.getByText(
        "영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("두 칸을 모두 채우기 전에는 버튼이 눌리지 않는다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();

    const button = await screen.findByRole("button", {
      name: "비밀번호 바꾸기",
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("새 비밀번호"), {
      target: { value: NEW_PASSWORD },
    });
    expect(button).toBeDisabled();
  });

  it("규칙에 맞지 않으면 규칙 문구를 보여주고 요청하지 않는다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();
    await submitNewPassword("abcdef");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("두 비밀번호가 다르면 불일치 문구를 보여주고 요청하지 않는다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();
    await submitNewPassword(NEW_PASSWORD, "Other123!");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "비밀번호가 서로 달라요.",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("chooseAccount 와 password 를 보내고 성공하면 완료 화면을 보여준다(임시비밀번호 없음)", async () => {
    state.siteKey = "schoolmentor";
    mockFetch.mockResolvedValueOnce(changedResponse);
    await verifyPhone();
    await submitNewPassword();

    expect(
      await screen.findByText(
        "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "로그인하러 가기" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("임시비밀번호 복사하기")).toBeNull();
    expect(requestBody(0)).toEqual({
      phone: "01012345678",
      chooseAccount: true,
      password: NEW_PASSWORD,
    });
  });

  it("409 면 계정 카드를 보여주고, 고르면 같은 비밀번호와 accountId 로 다시 요청한다", async () => {
    state.siteKey = "schoolmentor";
    mockFetch
      .mockResolvedValueOnce(chooseResponse)
      .mockResolvedValueOnce(changedResponse);
    await verifyPhone();
    await submitNewPassword();

    expect(await screen.findByText("kim*****")).toBeInTheDocument();
    expect(screen.getByText("한빛중학교")).toBeInTheDocument();
    fireEvent.click(screen.getByText("abc*"));

    expect(
      await screen.findByText(
        "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(requestBody(1)).toEqual({
      phone: "01012345678",
      chooseAccount: true,
      accountId: "p2",
      password: NEW_PASSWORD,
    });
  });

  it("서버가 실패를 알리면 detail 을 보여준다", async () => {
    state.siteKey = "schoolmentor";
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({
        ok: false,
        reason: "revoke_failed",
        detail: "비밀번호는 바뀌었어요.",
      }),
    });
    await verifyPhone();
    await submitNewPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "비밀번호는 바뀌었어요.",
    );
  });
});

describe("FindPassword 위닝 휴대폰 경로", () => {
  it("인증 직후 임시비밀번호를 받아 보여준다", async () => {
    state.siteKey = "winning";
    mockFetch.mockResolvedValueOnce(successResponse);
    await verifyPhone();

    expect(await screen.findByText("Tmp#pass9")).toBeInTheDocument();
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
  });

  it("위닝은 새 필드를 보내지 않는다", async () => {
    state.siteKey = "winning";
    mockFetch.mockResolvedValueOnce(successResponse);
    await verifyPhone();

    expect(await screen.findByText("Tmp#pass9")).toBeInTheDocument();
    expect(requestBody(0)).toEqual({ phone: "01012345678" });
  });
});
