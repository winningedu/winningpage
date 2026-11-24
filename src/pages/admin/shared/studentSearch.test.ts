import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/client", () => ({ api: { get: http.get } }));

import {
  type STUDENT_SEARCH_SECTIONS,
  studentSearchKeys,
  studentSearchQueryOptions,
} from "./studentSearch";

const ITEMS = [{ id: "s-1", name: "김하늘", email: "a@b.c", isAdmin: false }];

beforeEach(() => {
  http.get.mockReset();
  http.get.mockReturnValue({
    json: async (schema: { parse: (v: unknown) => unknown }) =>
      schema.parse({ items: ITEMS }),
  });
});

// queryFn 을 signal 과 함께 실행해 api.get 호출 인자를 읽는다.
async function run(
  section: (typeof STUDENT_SEARCH_SECTIONS)[number],
  term: string,
) {
  const signal = new AbortController().signal;
  const options = studentSearchQueryOptions(section, term);
  const queryFn = options.queryFn as (ctx: {
    signal: AbortSignal;
  }) => Promise<unknown>;
  const result = await queryFn({ signal });
  const [path, init] = http.get.mock.calls[0] as [
    string,
    { searchParams: Record<string, string>; signal: AbortSignal },
  ];
  return { result, path, init, signal };
}

describe("studentSearchQueryOptions", () => {
  test("검색어를 다듬어 섹션과 함께 보내고 signal 을 넘기며 응답을 스키마로 검증한다", async () => {
    const { result, path, init, signal } = await run(
      "growthReports",
      "  김하늘 ",
    );
    expect(path).toBe("admin/students/search");
    expect(init.searchParams).toEqual({
      q: "김하늘",
      section: "growthReports",
    });
    expect(init.signal).toBe(signal);
    expect(result).toEqual({ items: ITEMS });
  });

  test("서버 응답이 스키마에 맞지 않으면 던진다", async () => {
    http.get.mockReturnValue({
      json: async (schema: { parse: (v: unknown) => unknown }) =>
        schema.parse({ items: [{ id: 1 }] }),
    });
    await expect(run("inquirySessions", "김")).rejects.toThrow();
  });

  test.each(["", "   "])("공백뿐인 검색어(%j)는 요청을 켜지 않는다", (term) => {
    expect(studentSearchQueryOptions("growthReports", term).enabled).toBe(
      false,
    );
  });

  test("검색어가 있으면 요청을 켠다", () => {
    expect(studentSearchQueryOptions("growthReports", " 김 ").enabled).toBe(
      true,
    );
  });

  test("키는 섹션과 다듬은 검색어로 갈린다", () => {
    expect(studentSearchKeys.search("selfevalSessions", " 김 ")).toEqual([
      "admin",
      "student-search",
      "selfevalSessions",
      "김",
    ]);
    expect(
      studentSearchQueryOptions("serviceCreditAdjust", "김").queryKey,
    ).toEqual(studentSearchKeys.search("serviceCreditAdjust", "김"));
    expect(studentSearchKeys.search("growthReports", "김")).not.toEqual(
      studentSearchKeys.search("inquirySessions", "김"),
    );
  });
});
