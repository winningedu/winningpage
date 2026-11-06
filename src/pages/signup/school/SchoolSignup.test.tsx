import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupProvider } from "@/context/SignupContext";
import SchoolSignup from "./SchoolSignup";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { setSession: vi.fn(async () => ({ error: null })) },
  },
}));

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup/student"]}>
      <SignupProvider>
        <Routes>
          <Route path="/signup/student" element={<SchoolSignup />} />
        </Routes>
      </SignupProvider>
    </MemoryRouter>,
  );
}

function check(name: RegExp) {
  fireEvent.click(screen.getByRole("checkbox", { name }));
}

// 경로별 응답을 정해 두는 fetch 대역. 호출 본문은 calls에 쌓인다.
type Reply = { status?: number; body: unknown };
const calls: { url: string; body: Record<string, unknown> }[] = [];

function mockApi(routes: Record<string, Reply | ((body: unknown) => Reply)>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      const route = routes[url];
      const reply = typeof route === "function" ? route(body) : route;
      const status = reply?.status ?? 200;
      return {
        ok: status < 300,
        status,
        json: async () => reply?.body ?? {},
      };
    }),
  );
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function agreeRequiredTerms() {
  check(/이용약관/);
  check(/개인정보 수집 및 이용/);
  check(/DB 전환 안내/);
  click("다음");
}

const TENANT = { tenantId: "t-1", name: "새빛중학교", orgType: "학교" };

beforeEach(() => {
  window.sessionStorage.clear();
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("1단계 약관 동의", () => {
  it("필수 3개를 모두 동의해야 다음으로 넘어간다", () => {
    renderSignup();

    const next = screen.getByRole("button", { name: "다음" });
    expect(next).toBeDisabled();

    check(/이용약관/);
    check(/개인정보 수집 및 이용/);
    expect(next).toBeDisabled();

    check(/DB 전환 안내/);
    expect(next).toBeEnabled();
  });
});

describe("2단계 소속 확인", () => {
  it("소속코드를 확인하면 기관명이 보이고 다음 단계로 간다", async () => {
    mockApi({ "/api/signup/tenant-lookup": { body: TENANT } });
    renderSignup();
    agreeRequiredTerms();

    type("소속코드", "abcdefgh");
    click("확인");

    expect(await screen.findByText("새빛중학교")).toBeInTheDocument();
    expect(calls[0]?.body).toEqual({ code: "ABCDEFGH" });

    click("다음");
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
  });
});
