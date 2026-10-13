import { beforeEach, describe, expect, test, vi } from "vitest";

const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "ilike", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(result);
  };
  return {
    supabase: {
      from: (table: string) => {
        calls.push({ method: "from", args: [table] });
        return chain;
      },
    },
  };
});

import {
  buildSearchRows,
  escapeIlike,
  pushUniversity,
  searchDepartments,
  searchOutcome,
  searchUniversities,
  toggleOption,
} from "./surveySearch";

describe("searchOutcome", () => {
  test("검색어가 비어 있으면 idle", () => {
    expect(searchOutcome({ query: "  ", loading: false, results: [] })).toBe(
      "idle",
    );
  });
  test("조회 중이면 loading", () => {
    expect(searchOutcome({ query: "도시", loading: true, results: [] })).toBe(
      "loading",
    );
  });
  test("결과가 있으면 results", () => {
    expect(
      searchOutcome({ query: "도시", loading: false, results: ["도시공학과"] }),
    ).toBe("results");
  });
  test("결과가 없으면 직접 입력 분기(empty)", () => {
    expect(
      searchOutcome({
        query: "도시데이터융합학과",
        loading: false,
        results: [],
      }),
    ).toBe("empty");
  });
});

describe("buildSearchRows", () => {
  test("중복과 빈 값을 걷고 등장 순서를 지킨다", () => {
    expect(
      buildSearchRows([
        { name: "도시공학과" },
        { name: " " },
        { name: null },
        { name: "도시공학과" },
        { name: "도시계획학과" },
      ]),
    ).toEqual(["도시공학과", "도시계획학과"]);
  });
});

describe("escapeIlike", () => {
  test("% _ \\ 를 이스케이프한다", () => {
    expect(escapeIlike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});

describe("pushUniversity", () => {
  const a = { name: "서울시립대학교", source: "search" as const };
  const b = { name: "건국대학교", source: "search" as const };
  const c = { name: "한양대학교", source: "search" as const };
  test("두 곳까지 쌓인다", () => {
    expect(pushUniversity([a], b)).toEqual([a, b]);
  });
  test("세 번째를 고르면 가장 먼저 고른 대학이 빠진다", () => {
    expect(pushUniversity([a, b], c)).toEqual([b, c]);
  });
  test("같은 대학은 다시 넣지 않는다", () => {
    expect(pushUniversity([a, b], a)).toEqual([a, b]);
  });
});

describe("toggleOption", () => {
  test("없으면 더하고 있으면 뺀다", () => {
    expect(toggleOption([], "글쓰기와 비평")).toEqual(["글쓰기와 비평"]);
    expect(
      toggleOption(["글쓰기와 비평", "설계와 만들기"], "글쓰기와 비평"),
    ).toEqual(["설계와 만들기"]);
  });
});

describe("searchUniversities", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  test("입력을 정규화해 대학 색인 뷰에서 조회한다", async () => {
    result = {
      data: [
        { university_name: "고려대" },
        { university_name: "고려대(세종)" },
      ],
      error: null,
    };
    const names = await searchUniversities("고려대학교");
    expect(names).toEqual(["고려대", "고려대(세종)"]);
    expect(calls).toContainEqual({
      method: "from",
      args: ["admission_result_university_index"],
    });
    expect(calls).toContainEqual({
      method: "ilike",
      args: ["university_key", "%고려대%"],
    });
  });

  test("조회 오류는 빈 목록으로 돌려준다", async () => {
    result = { data: null, error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await searchUniversities("고려")).toEqual([]);
  });
});

describe("searchDepartments", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  test("학과 색인 뷰에서 조회하고 중복 이름은 한 번만 보인다", async () => {
    result = {
      data: [
        { department_name: "경영학과" },
        { department_name: "경영학과" },
        { department_name: "경영학부" },
      ],
      error: null,
    };
    const names = await searchDepartments("경영");
    expect(names).toEqual(["경영학과", "경영학부"]);
    expect(calls).toContainEqual({
      method: "from",
      args: ["admission_result_department_index"],
    });
    expect(calls).toContainEqual({
      method: "ilike",
      args: ["department_name", "%경영%"],
    });
    expect(calls).toContainEqual({ method: "limit", args: [400] });
  });
});
