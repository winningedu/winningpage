import { describe, expect, test } from "vitest";
import {
  buildSelfevalSessionsSearch,
  initialSelfevalSessionsQuery,
  selfevalSessionsQueryReducer,
} from "./selfevalSessionsQuery";

describe("selfevalSessionsQuery", () => {
  test("초기 검색 문자열은 page 와 pageSize 만", () => {
    expect(buildSelfevalSessionsSearch(initialSelfevalSessionsQuery)).toBe(
      "page=1&pageSize=20",
    );
  });

  test("상태 변경은 1페이지로 돌린다", () => {
    const s = selfevalSessionsQueryReducer(
      { ...initialSelfevalSessionsQuery, page: 3 },
      { type: "setStatus", status: "archived" },
    );
    expect(s).toMatchObject({ status: "archived", page: 1 });
  });

  test("검색 제출은 draft 를 다듬어 q 로 옮기고 1페이지로", () => {
    let s = selfevalSessionsQueryReducer(
      { ...initialSelfevalSessionsQuery, page: 2 },
      { type: "setDraft", draft: " 물리 " },
    );
    s = selfevalSessionsQueryReducer(s, { type: "submit" });
    expect(s).toMatchObject({ q: "물리", page: 1 });
    expect(buildSelfevalSessionsSearch(s)).toBe(
      "q=%EB%AC%BC%EB%A6%AC&page=1&pageSize=20",
    );
  });

  test("페이지는 1 미만으로 내려가지 않는다", () => {
    const s = selfevalSessionsQueryReducer(initialSelfevalSessionsQuery, {
      type: "setPage",
      page: 0,
    });
    expect(s.page).toBe(1);
  });
});
