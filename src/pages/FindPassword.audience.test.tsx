// FindPassword.tsx 최상단 학생/선생님 탭 - 스쿨멘토에만 보이고 위닝은 지금 그대로 그린다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FindPassword from "./FindPassword";

const state = vi.hoisted(() => ({ siteKey: "schoolmentor" }));

vi.mock("@/config/site", () => ({
  site: {
    get key() {
      return state.siteKey;
    },
  },
}));

vi.mock("@/hooks/useSignupEnabled", () => ({ useSignupEnabled: () => false }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));

function renderFindPassword() {
  render(
    <MemoryRouter>
      <FindPassword />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.siteKey = "schoolmentor";
});

describe("FindPassword 학생/선생님 탭", () => {
  it("스쿨멘토는 학생 탭이 기본이고 지금의 휴대폰 인증 화면을 그대로 보여 준다", () => {
    renderFindPassword();

    expect(screen.getByRole("tab", { name: "학생" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "선생님" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByLabelText("전화번호")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "이메일 링크" }),
    ).toBeInTheDocument();
  });

  it("선생님 탭을 누르면 선생님 비밀번호 찾기 화면으로 바뀌고 학생 탭으로 돌아올 수 있다", () => {
    renderFindPassword();

    fireEvent.click(screen.getByRole("tab", { name: "선생님" }));

    expect(screen.getByLabelText("아이디")).toBeInTheDocument();
    expect(screen.getByLabelText("휴대폰 번호")).toBeInTheDocument();
    expect(screen.queryByLabelText("전화번호")).toBeNull();
    expect(screen.queryByRole("tab", { name: "이메일 링크" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "학생" }));

    expect(screen.getByLabelText("전화번호")).toBeInTheDocument();
  });

  it("위닝은 학생/선생님 탭 없이 지금 그대로 그린다", () => {
    state.siteKey = "winning";
    renderFindPassword();

    expect(screen.queryByRole("tab", { name: "학생" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "선생님" })).toBeNull();
    expect(
      screen.getByRole("tab", { name: "휴대폰 인증" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("전화번호")).toBeInTheDocument();
  });
});
