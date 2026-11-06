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

function renderLogin(entry = "/login") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
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

function fillAndSubmit(identifier = "kim01", password = "pw1234") {
  fireEvent.change(screen.getByPlaceholderText("아이디를 입력해 주세요."), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByPlaceholderText("비밀번호를 입력해 주세요."), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

const OK_BODY = {
  session: { access_token: "at", refresh_token: "rt", expires_at: 99 },
  mustChangePassword: false,
};

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

  it("서버가 준 실패 문구를 그대로 보여 주고 세션을 심지 않는다", async () => {
    const message = "아이디 또는 비밀번호가 올바르지 않습니다. (실패 2/5회)";
    mockFetch.mockResolvedValue(
      jsonResponse(401, { error: { code: "INVALID", message }, failCount: 2 }),
    );
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("mustChangePassword 면 첫 비밀번호 설정 화면으로 이동한다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, {
        ...OK_BODY,
        mustChangePassword: true,
        isTeacher: true,
      }),
    );
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    expect(
      await screen.findByText("첫 비밀번호 설정 화면"),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("교사는 redirect 가 없으면 교사 콘솔로 이동한다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { ...OK_BODY, isTeacher: true }),
    );
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/teacher"));
  });

  it("교사는 redirect 가 교사 콘솔 안이면 그대로 따른다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { ...OK_BODY, isTeacher: true }),
    );
    renderLogin("/login?redirect=/teacher/students");
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/teacher/students"),
    );
  });

  it("교사는 redirect 가 교사 콘솔 밖이면 교사 콘솔로 이동한다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { ...OK_BODY, isTeacher: true }),
    );
    renderLogin("/login?redirect=/mypage");
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/teacher"));
  });

  it("교사가 아닌 계정은 redirect 를 그대로 따른다", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { ...OK_BODY, isTeacher: false }),
    );
    renderLogin("/login?redirect=/mypage");
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/mypage"));
  });

  it("아이디 저장을 켜고 성공하면 아이디만 localStorage 에 남긴다", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, OK_BODY));
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fireEvent.click(screen.getByLabelText("아이디 저장"));
    fillAndSubmit("kim01", "pw1234");

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const stored = Object.keys(localStorage).map((k) => [
      k,
      localStorage.getItem(k),
    ]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.[1]).toBe("kim01");
    expect(JSON.stringify(stored)).not.toContain("pw1234");
  });

  it("저장된 아이디는 다음 방문에 채워지고 체크가 켜져 있다", async () => {
    localStorage.setItem("schoolmentor.savedLoginId", "kim01");
    renderLogin();

    expect(
      await screen.findByPlaceholderText("아이디를 입력해 주세요."),
    ).toHaveValue("kim01");
    expect(screen.getByLabelText("아이디 저장")).toBeChecked();
  });

  it("체크를 끄고 성공하면 저장된 아이디를 지운다", async () => {
    localStorage.setItem("schoolmentor.savedLoginId", "kim01");
    mockFetch.mockResolvedValue(jsonResponse(200, OK_BODY));
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fireEvent.click(screen.getByLabelText("아이디 저장"));
    fillAndSubmit("kim01", "pw1234");

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(localStorage.length).toBe(0);
  });

  it("localStorage 가 막혀 있어도 로그인은 진행된다", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, OK_BODY));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderLogin();
    await screen.findByPlaceholderText("아이디를 입력해 주세요.");

    fireEvent.click(screen.getByLabelText("아이디 저장"));
    fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    vi.restoreAllMocks();
  });
});

describe("Login - 위닝 클라이언트 직접 로그인(회귀)", () => {
  beforeEach(() => {
    state.serverLogin = false;
  });

  it("서버 로그인 대신 signInWithPassword 를 직접 부르고 이메일 문구를 유지한다", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    renderLogin();

    const email = await screen.findByPlaceholderText("이메일을 입력해 주세요.");
    expect(email).toHaveAttribute("type", "email");
    expect(screen.queryByLabelText("아이디 저장")).not.toBeInTheDocument();
    fireEvent.change(email, { target: { value: " Kim@Example.com " } });
    fireEvent.change(screen.getByPlaceholderText("비밀번호를 입력해 주세요."), {
      target: { value: "pw1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "kim@example.com",
      password: "pw1234",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("잘못된 자격 증명은 기존 이메일 문구로 보여 준다", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });
    renderLogin();
    await screen.findByPlaceholderText("이메일을 입력해 주세요.");

    fireEvent.change(screen.getByPlaceholderText("이메일을 입력해 주세요."), {
      target: { value: "kim@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("비밀번호를 입력해 주세요."), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByText("이메일 또는 비밀번호가 올바르지 않습니다."),
    ).toBeInTheDocument();
  });
});
