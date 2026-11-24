import { describe, expect, test } from "vitest";
import {
  INQUIRY_SESSIONS_PAGE_SIZE,
  parseInquirySessionsParams,
  patchInquirySessionsParams,
} from "./query";

const parse = (search: string) =>
  parseInquirySessionsParams(new URLSearchParams(search));

describe("parseInquirySessionsParams", () => {
  test("빈 주소는 전체 상태, 빈 검색어, 1페이지다", () => {
    expect(parse("")).toEqual({
      status: "",
      q: "",
      page: 1,
      pageSize: INQUIRY_SESSIONS_PAGE_SIZE,
    });
    expect(INQUIRY_SESSIONS_PAGE_SIZE).toBe(20);
  });

  test("주소의 상태, 검색어, 페이지를 읽는다", () => {
    expect(parse("status=archived&q=%EA%B9%80&page=3")).toMatchObject({
      status: "archived",
      q: "김",
      page: 3,
    });
  });

  test("모르는 상태와 잘못된 페이지는 기본값으로 읽는다", () => {
    expect(parse("status=bogus&page=0").status).toBe("");
    expect(parse("status=bogus&page=0").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("page=2.5").page).toBe(1);
  });
});

describe("patchInquirySessionsParams", () => {
  test("상태를 바꾸면 1페이지로 돌아간다", () => {
    const next = patchInquirySessionsParams(new URLSearchParams("page=3&q=a"), {
      status: "archived",
    });
    expect(next.get("status")).toBe("archived");
    expect(next.get("q")).toBe("a");
    expect(next.has("page")).toBe(false);
  });

  test("검색어를 적용하면 1페이지로 돌아가고 빈 값은 주소에서 빠진다", () => {
    const next = patchInquirySessionsParams(
      new URLSearchParams("status=draft&page=3&q=a"),
      { q: "" },
    );
    expect(next.has("q")).toBe(false);
    expect(next.has("page")).toBe(false);
    expect(next.get("status")).toBe("draft");
  });

  test("페이지만 바꾸면 나머지는 그대로다", () => {
    const next = patchInquirySessionsParams(
      new URLSearchParams("status=draft&q=a"),
      { page: 4 },
    );
    expect(next.toString()).toBe("status=draft&q=a&page=4");
  });
});
