import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  window.sessionStorage.clear();
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
