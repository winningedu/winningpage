// 관리자 상단바. 스쿨멘토(hqTenantAdmin)에서만 교사 화면(대리 접속) 진입 링크가 보인다.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ hqTenantAdmin: true }));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get hqTenantAdmin() {
        return state.hqTenantAdmin;
      },
    },
  },
}));

import { AdminTopbar } from "./AdminTopbar";

function renderTopbar() {
  return render(
    <MemoryRouter>
      <AdminTopbar onLogout={() => {}} />
    </MemoryRouter>,
  );
}

describe("AdminTopbar", () => {
  beforeEach(() => {
    state.hqTenantAdmin = true;
  });

  test("hqTenantAdmin 이 켜져 있으면 교사 화면 링크가 메인 링크 앞에 있다", () => {
    renderTopbar();

    const teacher = screen.getByRole("link", { name: "교사 화면으로 이동" });
    const main = screen.getByRole("link", { name: "메인으로 이동" });
    expect(teacher.getAttribute("href")).toBe("/teacher");
    expect(
      teacher.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("hqTenantAdmin 이 꺼져 있으면 교사 화면 링크가 없고 나머지는 그대로다", () => {
    state.hqTenantAdmin = false;
    renderTopbar();

    expect(
      screen.queryByRole("link", { name: "교사 화면으로 이동" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "메인으로 이동" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });
});
