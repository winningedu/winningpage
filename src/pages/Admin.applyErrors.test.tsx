import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 공개 연도 저장(admission)만 아직 supabase 를 쓴다. upsert 가 실패하는 가짜 supabase.
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

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

// 입결 백필은 서버 라우트(cutsApi)를 거친다. 응답은 실제 zod 스키마로 한 번 더 통과시킨다.
const reply = (call: (...args: unknown[]) => unknown) => ({
  json: async (schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await call()),
});

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: {
    get: (...args: unknown[]) => reply(() => mocks.get(...args)),
    post: (...args: unknown[]) => reply(() => mocks.post(...args)),
  },
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  fetchSectionList: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { AdminSectionRoute } from "./Admin";
import { TestQueryProvider } from "./admin/engine/testQuery";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

const PREVIEW = {
  sourceRowCount: 1,
  stats: {
    universityCount: 1,
    pairCount: 1,
    totalRows: 2,
    normalCount: 1,
    specialCount: 1,
    year2026Pairs: 1,
    year2025Pairs: 0,
    excludedStarPairs: 0,
    excludedEmptyPairs: 0,
    excludedNoTrackPairs: 0,
    mergedCount: 0,
    distribution: { min: 2, p25: 2, median: 2, p75: 2, max: 2 },
    samples: [],
  },
  analysis: {
    overlapCount: 0,
    manualCount: 0,
    inactiveCount: 0,
    notedCount: 0,
    preservedCount: 0,
    nameAxisCount: 0,
  },
  applyCount: 2,
  orphanCount: 0,
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation(async (url: string) => {
    if (url === "goal/admin/cuts/backfill") return PREVIEW;
    throw new Error(`unexpected GET ${url}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin 입결 백필 적용 오류 안내", () => {
  async function renderAndApply() {
    render(
      <TestQueryProvider>
        <MemoryRouter initialEntries={["/admin/goalUniversityCuts"]}>
          <AdminSectionRoute section="goalUniversityCuts" />
          <Toaster />
        </MemoryRouter>
      </TestQueryProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "미리보기 계산" }),
    );
    fireEvent.click(await screen.findByLabelText(/행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
  }

  // 서버가 BACKFILL_APPLY_FAILED 로 내리는 problem 본문. DB 오류 원문은 싣지 않는다.
  function applyFailure(status: number, extra: Record<string, unknown> = {}) {
    const detail =
      "백필 반영 중 일부 청크가 실패했습니다. 이미 반영된 청크는 되돌려지지 않습니다.";
    return new ApiError({
      status,
      code: "BACKFILL_APPLY_FAILED",
      detail,
      problem: {
        type: "about:blank",
        title: "t",
        status,
        detail,
        code: "BACKFILL_APPLY_FAILED",
        applied: 0,
        step: "upsert",
        range: "1~2",
        columns: [],
        ...extra,
      },
    });
  }

  it("서버가 5xx 로 적용 실패를 알리면 행 범위와 되돌려지지 않는다는 안내가 토스트 제목에 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    mocks.post.mockRejectedValue(applyFailure(500));
    await renderAndApply();

    await waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-slot="toast-title"]'),
      ).map((node) => node.textContent ?? "");
      expect(titles.join("|")).toContain("백필 적용 실패(1~2행)");
      expect(titles.join("|")).toContain("되돌려지지 않습니다");
    });
    expect(document.body.textContent).not.toContain("duplicate key");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("서버가 4xx 중복으로 거절하면 제목에는 되돌려지지 않는다는 문구 없이 행 범위만 붙고 설명은 서버 문장을 보인다", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mocks.post.mockRejectedValue(
      applyFailure(409, {
        dbCode: "DB_UNIQUE_VIOLATION",
        columns: ["university_name", "department_name"],
      }),
    );
    await renderAndApply();

    await waitFor(() => {
      const title = document.querySelector('[data-slot="toast-title"]');
      expect(title).toHaveTextContent("백필 적용 실패(1~2행)");
    });
    // 4xx 는 아무것도 쓰지 않은 거절이라 제목에 부분 반영 안내가 붙지 않는다.
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).not.toHaveTextContent("되돌려지지 않습니다");
    // 오류 코드가 BACKFILL_APPLY_FAILED 라 DB_UNIQUE_VIOLATION 라벨 매핑은 타지 않고
    // 서버가 쓴 detail 이 그대로 설명이 된다(dbCode 는 화면에서 쓰지 않는다).
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("백필 반영 중 일부 청크가 실패했습니다");
    expect(document.body.textContent).not.toContain("duplicate key");
  });

  it("공개 연도 저장에 실패하면 DB 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <TestQueryProvider>
        <MemoryRouter initialEntries={["/admin/admissionGuidelines"]}>
          <AdminSectionRoute section="admissionGuidelines" />
          <Toaster />
          <ConfirmAdminHost />
        </MemoryRouter>
      </TestQueryProvider>,
    );

    fireEvent.change(await screen.findByLabelText("새 공개 연도"), {
      target: { value: "2030" },
    });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    // 0개교 연도는 확인창을 거친다. 예전 window.confirm 이 아니라 AlertDialog 다.
    fireEvent.click(await screen.findByRole("button", { name: "지정" }));

    await waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-slot="toast-title"]'),
      ).map((node) => node.textContent);
      expect(titles).toContain("공개 연도 저장 실패");
    });
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
