import { describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/client", () => ({ api: http }));

import { sectionKeys } from "./api";
import { parseListPageAndQ, sectionListQueryOptions } from "./sectionList";

describe("parseListPageAndQ", () => {
  it("page 는 1 이상의 정수만, q 는 없으면 빈 문자열이다", () => {
    expect(parseListPageAndQ(new URLSearchParams("page=3&q=서울"))).toEqual({
      page: 3,
      q: "서울",
    });
    expect(parseListPageAndQ(new URLSearchParams("page=0"))).toEqual({
      page: 1,
      q: "",
    });
    expect(parseListPageAndQ(new URLSearchParams("page=x"))).toEqual({
      page: 1,
      q: "",
    });
  });
});

describe("엔진 목록 쿼리 키", () => {
  // 라우트 미들웨어의 선받기와 화면이 같은 캐시 칸을 쓰는 약속이다. 바꾸면 선받은 데이터를 못 찾는다.
  it("서버 페이지 섹션은 [admin, sections, 키, { page, q }], 전량 섹션은 [admin, sections, 키] 다", () => {
    expect(
      sectionListQueryOptions("admissionResults", { page: 2, q: "서울" })
        .queryKey,
    ).toEqual([
      "admin",
      "sections",
      "admissionResults",
      { page: 2, q: "서울" },
    ]);
    expect(
      sectionListQueryOptions("banners", { page: 2, q: "서울" }).queryKey,
    ).toEqual(["admin", "sections", "banners"]);
    expect(sectionKeys.row("banners", 7)).toEqual([
      "admin",
      "sections",
      "banners",
      "row",
      "7",
    ]);
  });
});

describe("sectionListQueryOptions", () => {
  it("서버 페이지 섹션은 page 와 q 를 키에 싣고 같은 값으로 요청한다", async () => {
    http.get.mockReturnValue({
      json: async () => ({ items: [], total: 0 }),
    });
    const options = sectionListQueryOptions("admissionResults", {
      page: 2,
      q: "서울",
    });

    expect(options.queryKey).toEqual(
      sectionKeys.list("admissionResults", { page: 2, q: "서울" }),
    );
    await options.queryFn?.({ signal: new AbortController().signal } as never);
    expect(http.get).toHaveBeenCalledWith(
      "admin/sections/admissionResults",
      expect.objectContaining({ searchParams: { page: 2, q: "서울" } }),
    );
  });

  it("전량 섹션은 page 와 q 를 무시하고 섹션 키 하나만 쓴다", () => {
    const options = sectionListQueryOptions("banners", { page: 2, q: "서울" });

    expect(options.queryKey).toEqual(sectionKeys.list("banners"));
  });
});
