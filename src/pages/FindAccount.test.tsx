// FindAccount.tsx - 스쿨멘토는 이메일(가림)과 소속 이름을 함께 보여주고, 위닝은 지금처럼
// 가린 이메일만 보여준다. 휴대폰 인증은 모킹해 곧바로 통과시킨다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FindAccount from "./FindAccount";

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

async function verifyPhone() {
  render(
    <MemoryRouter>
      <FindAccount />
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
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      found: true,
      via: "phone",
      masked_email: "ki****@ex***.com",
      masked_emails: ["ki****@ex***.com", "ab****@ex***.com"],
      accounts: [
        { maskedEmail: "ki****@ex***.com", tenantName: "한빛중학교" },
        { maskedEmail: "ab****@ex***.com", tenantName: null },
        { maskedId: "tea***********", tenantName: "새봄학원" },
      ],
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("FindAccount", () => {
  it("스쿨멘토는 가린 이메일과 소속 이름을 계정마다 보여준다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();

    expect(await screen.findByText("ki****@ex***.com")).toBeInTheDocument();
    expect(screen.getByText("한빛중학교")).toBeInTheDocument();
    expect(screen.getByText("ab****@ex***.com")).toBeInTheDocument();
    expect(screen.getByText("이메일을 찾아드려요")).toBeInTheDocument();
    expect(
      screen.getByText("해당 번호로 가입된 이메일이에요."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토 선생님 계정은 가린 아이디로 보여준다", async () => {
    state.siteKey = "schoolmentor";
    await verifyPhone();

    expect(
      await screen.findByText("아이디 tea***********"),
    ).toBeInTheDocument();
    expect(screen.getByText("새봄학원")).toBeInTheDocument();
  });

  it("위닝은 가린 이메일만 보여준다", async () => {
    state.siteKey = "winning";
    await verifyPhone();

    expect(await screen.findByText("ki****@ex***.com")).toBeInTheDocument();
    expect(screen.queryByText("한빛중학교")).not.toBeInTheDocument();
  });
});
