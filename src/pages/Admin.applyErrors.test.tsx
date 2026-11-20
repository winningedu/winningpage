import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 입결 백필 적용 단계(upsert)만 실패하는 가짜 supabase. 나머지 조회는 정상 응답이다.
const SOURCE_ROW = {
  university_name: "가나대학교",
  department_name: "국어국문학과",
  main_track: "교과",
  grade_70: 3,
  result_year: 2026,
};

function fakeTable(table: string) {
  const state = { head: false, upsert: false };
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => {
            if (state.upsert) {
              resolve({
                data: null,
                error: { message: "duplicate key 홍길동", code: "23505" },
              });
            } else if (table === "admission_results") {
              resolve(
                state.head
                  ? { count: 1, error: null }
                  : { data: [SOURCE_ROW], error: null },
              );
            } else {
              resolve(
                state.head
                  ? { count: 0, error: null }
                  : { data: [], error: null },
              );
            }
          };
        }
        return (...args: unknown[]) => {
          if (prop === "select") {
            state.head = Boolean((args[1] as { head?: boolean })?.head);
          }
          if (prop === "upsert") state.upsert = true;
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => fakeTable(table),
    rpc: () => fakeTable("rpc"),
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { Toaster } from "@/components/ui/toast";
import { AdminSectionRoute } from "./Admin";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin 입결 백필 적용 오류 안내", () => {
  it("적용에 실패하면 DB 원문 없이 되돌려지지 않는다는 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/admin/goalUniversityCuts"]}>
        <AdminSectionRoute section="goalUniversityCuts" />
        <Toaster />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "미리보기 계산" }),
    );
    fireEvent.click(await screen.findByLabelText(/행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    await waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-slot="toast-title"]'),
      ).map((node) => node.textContent ?? "");
      expect(titles.join("|")).toContain("백필 적용 실패");
      expect(titles.join("|")).toContain("되돌려지지 않습니다");
    });
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("홍길동"),
    );
  });

  it("청크 적용에 실패하면 실패한 행 범위와 DB 오류 코드 안내를 함께 보인다", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/admin/goalUniversityCuts"]}>
        <AdminSectionRoute section="goalUniversityCuts" />
        <Toaster />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "미리보기 계산" }),
    );
    fireEvent.click(await screen.findByLabelText(/행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    await waitFor(() => {
      const title = document.querySelector('[data-slot="toast-title"]');
      expect(title).toHaveTextContent("(1~1행)");
    });
    // 청크로 감싸도 오류 코드가 살아 있어야 중복 안내가 나온다.
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("이미 등록된 값입니다(중복).");
    expect(document.body.textContent).not.toContain("홍길동");
  });

  it("공개 연도 저장에 실패하면 DB 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={["/admin/admissionGuidelines"]}>
        <AdminSectionRoute section="admissionGuidelines" />
        <Toaster />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("새 공개 연도"), {
      target: { value: "2030" },
    });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));

    await waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-slot="toast-title"]'),
      ).map((node) => node.textContent);
      expect(titles).toContain("공개 연도 저장 실패");
    });
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
