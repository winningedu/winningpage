import { describe, expect, test } from "vitest";
import {
  buildInquirySessionsSearch,
  initialInquirySessionsQuery,
  inquirySessionsQueryReducer,
} from "./inquirySessionsQuery";

const init = initialInquirySessionsQuery;

describe("inquirySessionsQueryReducer", () => {
  test("상태를 바꾸면 1페이지로 돌아간다", () => {
    const s = inquirySessionsQueryReducer(
      { ...init, page: 3 },
      { type: "setStatus", status: "archived" },
    );
    expect(s).toMatchObject({ status: "archived", page: 1 });
  });
  test("검색어는 입력 중 draft 와 적용 q 가 나뉜다", () => {
    const typed = inquirySessionsQueryReducer(init, {
      type: "setDraft",
      draft: "  김위닝 ",
    });
    expect(typed.q).toBe("");
    const submitted = inquirySessionsQueryReducer(
      { ...typed, page: 4 },
      { type: "submit" },
    );
    expect(submitted).toMatchObject({ q: "김위닝", page: 1 });
  });
  test("페이지는 1 미만으로 내려가지 않는다", () => {
    expect(
      inquirySessionsQueryReducer(init, { type: "setPage", page: 0 }).page,
    ).toBe(1);
  });
});

describe("buildInquirySessionsSearch", () => {
  test("빈 필터는 page 와 pageSize 만 담는다", () => {
    expect(buildInquirySessionsSearch(init)).toBe("page=1&pageSize=20");
  });
  test("상태와 검색어를 담는다", () => {
    const qs = buildInquirySessionsSearch({
      ...init,
      status: "archived",
      q: "a b",
    });
    expect(qs).toBe("status=archived&q=a+b&page=1&pageSize=20");
  });
});
