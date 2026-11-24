// 엔진 섹션 목록 상태(쪽, 검색어, 필터)가 주소에 실려 새로고침과 뒤로가기에서 되살아나는지 확인한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  fetchSectionList: vi.fn(),
  fetchSectionRow: vi.fn(),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  ...engine,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
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

import { renderSectionRoutes } from "./admin/engine/testRouter";

const RESULT = { id: 1, university_name: "가나대" };

function searchOf(router: { state: { location: { search: string } } }) {
  return new URLSearchParams(router.state.location.search);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  engine.fetchSectionList.mockResolvedValue({ items: [RESULT], total: 50 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("서버 페이지 목록의 주소 상태", () => {
  it("새로고침한 ?page=2&q=x 는 그 쪽과 검색어로 조회하고 입력창을 채운다", async () => {
    renderSectionRoutes(
      "admissionResults",
      "/admin/admissionResults?page=2&q=x",
    );

    await screen.findByText("가나대");
    expect(engine.fetchSectionList).toHaveBeenCalledWith(
      "admissionResults",
      { page: 2, q: "x" },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("textbox")).toHaveValue("x");
  });

  it("검색어를 입력하고 300ms 뒤 주소 q 를 바꾸며 쪽은 1로 돌린다(기본값은 주소에서 뺀다)", async () => {
    const { router } = renderSectionRoutes(
      "admissionResults",
      "/admin/admissionResults?page=3",
    );
    await screen.findByText("가나대");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "서울" },
    });
    expect(searchOf(router).get("q")).toBeNull();

    await waitFor(() => expect(searchOf(router).get("q")).toBe("서울"));
    expect(searchOf(router).has("page")).toBe(false);
    await waitFor(() =>
      expect(engine.fetchSectionList).toHaveBeenLastCalledWith(
        "admissionResults",
        { page: 1, q: "서울" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("총 건수보다 큰 쪽은 마지막 쪽으로 당기고 주소에도 반영한다", async () => {
    engine.fetchSectionList.mockResolvedValue({ items: [RESULT], total: 15 });
    const { router } = renderSectionRoutes(
      "admissionResults",
      "/admin/admissionResults?page=9",
    );

    await waitFor(() => expect(searchOf(router).get("page")).toBe("2"));
  });

  it("수정 화면에서 취소하면 쪽과 검색어가 그대로인 목록으로 돌아온다", async () => {
    engine.fetchSectionRow.mockResolvedValue(RESULT);
    const { router } = renderSectionRoutes(
      "admissionResults",
      "/admin/admissionResults?page=3&q=abc",
    );
    await screen.findByText("가나대");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/admissionResults/1"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/admissionResults"),
    );
    expect(router.state.location.search).toBe("?page=3&q=abc");
    await waitFor(() =>
      expect(engine.fetchSectionList).toHaveBeenLastCalledWith(
        "admissionResults",
        { page: 3, q: "abc" },
        expect.any(AbortSignal),
      ),
    );
  });
});

describe("전량 목록의 주소 상태", () => {
  const ENROLLMENTS = {
    items: [
      { id: 1, category_name: "목표관리", student_name: "가" },
      { id: 2, category_name: "성장설계", student_name: "나" },
    ],
    total: 2,
  };

  it("목록 필터는 주소 filter 로 되살아나고, 선택지에 없는 값은 무시한다", async () => {
    engine.fetchSectionList.mockResolvedValue(ENROLLMENTS);
    renderSectionRoutes("enrollments", "/admin/enrollments?filter=성장설계");

    await screen.findByText("나");
    expect(screen.queryByText("가")).not.toBeInTheDocument();
  });

  it("없는 filter 값은 무시해 전체를 보인다", async () => {
    engine.fetchSectionList.mockResolvedValue(ENROLLMENTS);
    renderSectionRoutes("enrollments", "/admin/enrollments?filter=없는값");

    expect(await screen.findByText("가")).toBeInTheDocument();
    expect(screen.getByText("나")).toBeInTheDocument();
  });

  it("필터를 고르면 주소 filter 가 바뀌고 쪽은 1이다", async () => {
    engine.fetchSectionList.mockResolvedValue(ENROLLMENTS);
    const { router } = renderSectionRoutes("enrollments", "/admin/enrollments");
    await screen.findByText("가");

    fireEvent.change(screen.getByLabelText("전체 서비스"), {
      target: { value: "목표관리" },
    });

    expect(searchOf(router).get("filter")).toBe("목표관리");
  });
});

describe("미검토 필터의 주소 상태", () => {
  it("?stale=1&months=12 는 체크와 개월 수를 되살리고, 끄면 주소에서 지운다", async () => {
    engine.fetchSectionList.mockResolvedValue({ items: [], total: 0 });
    const { router } = renderSectionRoutes(
      "winningSuhaengTopicDb",
      "/admin/winningSuhaengTopicDb?stale=1&months=12",
    );

    const check = await screen.findByRole("checkbox", {
      name: "미검토만 보기",
    });
    expect(check).toBeChecked();
    expect(screen.getByLabelText("미검토 기준 개월 수")).toHaveValue("12");

    fireEvent.click(check);
    expect(searchOf(router).has("stale")).toBe(false);
  });
});
