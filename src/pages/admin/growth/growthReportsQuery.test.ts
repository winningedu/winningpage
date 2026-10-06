import { describe, expect, test } from "vitest";
import {
  buildGrowthReportsSearch,
  GROWTH_REPORTS_PAGE_SIZE,
  growthReportsQueryReducer,
  initialGrowthReportsQuery,
} from "./growthReportsQuery";

describe("growthReportsQueryReducer", () => {
  test("초기 상태는 전체 상태, 빈 검색어, 1페이지다", () => {
    expect(initialGrowthReportsQuery).toEqual({
      status: "",
      draft: "",
      q: "",
      page: 1,
      pageSize: GROWTH_REPORTS_PAGE_SIZE,
    });
    expect(GROWTH_REPORTS_PAGE_SIZE).toBe(20);
  });
});

describe("growthReportsQueryReducer 동작", () => {
  test("상태를 바꾸면 1페이지로 돌아간다", () => {
    const moved = { ...initialGrowthReportsQuery, page: 3 };
    const next = growthReportsQueryReducer(moved, {
      type: "setStatus",
      status: "archived",
    });
    expect(next.status).toBe("archived");
    expect(next.page).toBe(1);
  });

  test("검색어 입력은 조회 전까지 q에 반영되지 않고, 조회하면 trim되어 1페이지로 적용된다", () => {
    let s = { ...initialGrowthReportsQuery, page: 4 };
    s = growthReportsQueryReducer(s, { type: "setDraft", draft: "  홍길동 " });
    expect(s.q).toBe("");
    s = growthReportsQueryReducer(s, { type: "submit" });
    expect(s.q).toBe("홍길동");
    expect(s.page).toBe(1);
  });

  test("페이지 이동은 1 미만으로 내려가지 않는다", () => {
    const s = growthReportsQueryReducer(initialGrowthReportsQuery, {
      type: "setPage",
      page: 0,
    });
    expect(s.page).toBe(1);
    expect(
      growthReportsQueryReducer(s, { type: "setPage", page: 3 }).page,
    ).toBe(3);
  });

  test("쿼리 문자열은 비어 있는 필터를 생략한다", () => {
    expect(buildGrowthReportsSearch(initialGrowthReportsQuery)).toBe(
      "page=1&pageSize=20",
    );
    expect(
      buildGrowthReportsSearch({
        ...initialGrowthReportsQuery,
        status: "archived",
        q: "a&b",
        page: 2,
      }),
    ).toBe("status=archived&q=a%26b&page=2&pageSize=20");
  });
});
