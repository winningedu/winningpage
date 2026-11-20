// 권한 묶음 관리의 오류 안내. DB 원문 대신 매핑된 안내만 토스트로 보인다.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  roles: [] as Record<string, unknown>[],
  loadError: null as { message: string; code?: string } | null,
  deleteError: null as { message: string; code?: string } | null,
}));

vi.mock("@/lib/supabase", () => {
  // 어떤 체인이든 끝에서 await 하면 { data, error } 가 나오는 가짜 쿼리 빌더.
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  return {
    supabase: {
      from: (table: string) => ({
        select: () =>
          query(
            table === "admin_roles"
              ? { data: state.roles, error: state.loadError }
              : { data: [], error: null },
          ),
        delete: () => query({ data: null, error: state.deleteError }),
      }),
    },
  };
});

import { Toaster } from "@/components/ui/toast";
import AdminRolesAdmin from "./AdminRolesAdmin";

const CONFIG = { title: "권한 관리", searchPlaceholder: "검색" };

function renderRoles() {
  render(
    <>
      <AdminRolesAdmin config={CONFIG} />
      <Toaster />
    </>,
  );
}

function expectToast(title: string, description: string) {
  return waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent(title);
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent(description);
  });
}

beforeEach(() => {
  state.roles = [];
  state.loadError = null;
  state.deleteError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminRolesAdmin 오류 안내", () => {
  test("조회에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    state.loadError = {
      message: "permission denied for 홍길동",
      code: "42501",
    };
    renderRoles();

    await expectToast("권한 관리 조회 실패", "코드: 42501");
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("삭제에 실패하면 '삭제 실패' 토스트가 보인다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    state.roles = [
      { id: "r1", name: "운영팀", is_super: false, is_system: false },
    ];
    state.deleteError = { message: "fk violation", code: "23505" };
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));

    await expectToast("삭제 실패", "이미 등록된 값입니다(중복)");
  });
});
