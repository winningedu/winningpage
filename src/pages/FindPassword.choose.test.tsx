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

describe("FindPassword 계정 고르기", () => {
  it("스쿨멘토는 chooseAccount 를 보내고 409 면 계정 카드를 보여준다", async () => {
    state.siteKey = "schoolmentor";
    mockFetch.mockResolvedValueOnce(chooseResponse);
    await verifyPhone();

    expect(await screen.findByText("kim*****")).toBeInTheDocument();
    expect(screen.getByText("한빛중학교")).toBeInTheDocument();
    expect(screen.getByText("새봄학원")).toBeInTheDocument();
    expect(requestBody(0)).toEqual({
      phone: "01012345678",
      chooseAccount: true,
    });
  });

  it("카드를 고르면 accountId 와 함께 다시 요청하고 임시비밀번호를 보여준다", async () => {
    state.siteKey = "schoolmentor";
    mockFetch
      .mockResolvedValueOnce(chooseResponse)
      .mockResolvedValueOnce(successResponse);
    await verifyPhone();

    fireEvent.click(await screen.findByText("abc*"));

    expect(await screen.findByText("Tmp#pass9")).toBeInTheDocument();
    expect(requestBody(1)).toEqual({
      phone: "01012345678",
      chooseAccount: true,
      accountId: "p2",
    });
  });

  it("위닝은 새 필드를 보내지 않는다", async () => {
    state.siteKey = "winning";
    mockFetch.mockResolvedValueOnce(successResponse);
    await verifyPhone();

    expect(await screen.findByText("Tmp#pass9")).toBeInTheDocument();
    expect(requestBody(0)).toEqual({ phone: "01012345678" });
  });
});
