import { describe, expect, test } from "vitest";
import {
  parseSelfevalSessionsQuery,
  patchSelfevalSessionsParams,
  selfevalSessionsRequestParams,
} from "./query";

const parse = (search: string) =>
  parseSelfevalSessionsQuery(new URLSearchParams(search));

describe("selfevalSessionsQuery", () => {
  test("주소에 아무것도 없으면 1페이지 전체 조회다", () => {
    expect(parse("")).toEqual({ status: "", q: "", page: 1, pageSize: 20 });
    expect(selfevalSessionsRequestParams(parse(""))).toEqual({
      page: "1",
      pageSize: "20",
    });
  });

  test("상태 검색어 페이지를 주소에서 읽어 요청 파라미터로 만든다", () => {
    const query = parse("status=archived&q=%EB%AC%BC%EB%A6%AC&page=3");
    expect(query).toEqual({
      status: "archived",
      q: "물리",
      page: 3,
      pageSize: 20,
    });
    expect(selfevalSessionsRequestParams(query)).toEqual({
      status: "archived",
      q: "물리",
      page: "3",
      pageSize: "20",
    });
  });

  test("모르는 상태와 잘못된 페이지는 기본값으로 읽는다", () => {
    expect(parse("status=bogus&page=0").status).toBe("");
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("page=1.5").page).toBe(1);
  });

  test("상태나 검색어를 바꾸면 페이지를 주소에서 뺀다", () => {
    const prev = new URLSearchParams("page=3&status=draft");
    expect(
      patchSelfevalSessionsParams(prev, { status: "archived" }).toString(),
    ).toBe("status=archived");
    expect(
      patchSelfevalSessionsParams(new URLSearchParams("page=2"), {
        q: "물리",
      }).get("page"),
    ).toBeNull();
  });

  test("기본값(전체, 검색어 없음, 1페이지)은 주소에서 뺀다", () => {
    const prev = new URLSearchParams("status=draft&q=a&page=2");
    expect(
      patchSelfevalSessionsParams(prev, { status: "", q: "" }).toString(),
    ).toBe("");
    expect(
      patchSelfevalSessionsParams(prev, { page: 1 }).get("page"),
    ).toBeNull();
    expect(patchSelfevalSessionsParams(prev, { page: 4 }).get("page")).toBe(
      "4",
    );
  });
});
