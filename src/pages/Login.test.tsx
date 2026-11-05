// Login.tsx 회귀 테스트 - 스쿨멘토(서버 로그인)와 위닝(클라이언트 직접 로그인) 분기.
//
// site.features.serverLogin 스위치로 갈린다. @/config/site 와 @/lib/supabase 는
// ResetPassword.test.tsx 관례대로 vi.mock 하고, 서버 로그인은 fetch 를 가로챈다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const state = vi.hoisted(() => ({ serverLogin: true }));
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockFetch = vi.fn();
const mockReplace = vi.fn();

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get serverLogin() {
        return state.serverLogin;
      },
    },
  },
}));

vi.mock("@/hooks/useSignupEnabled", () => ({ useSignupEnabled: () => false }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
    },
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/teacher/first-password"
          element={<p>첫 비밀번호 설정 화면</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

beforeEach(() => {
  state.serverLogin = true;
  vi.clearAllMocks();
  localStorage.clear();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSetSession.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("fetch", mockFetch);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      origin: "http://localhost",
      replace: mockReplace,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Login - 스쿨멘토 서버 로그인", () => {
  it("아이디 입력창(text)에 서버 로그인을 보내고 세션을 심은 뒤 이동한다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, {
        session: { access_token: "at", refresh_token: "rt", expires_at: 99 },
        mustChangePassword: false,
      }),
    );
    renderLogin();

    const id = await screen.findByPlaceholderText("아이디를 입력해 주세요.");
    expect(id).toHaveAttribute("type", "text");
    fireEvent.change(id, { target: { value: " Kim01 " } });
    fireEvent.change(screen.getByPlaceholderText("비밀번호를 입력해 주세요."), {
      target: { value: "pw1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ identifier: " Kim01 ", password: "pw1234" }),
      }),
    );
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
