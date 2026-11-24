import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { fetchResourceTitles, searchKnowledgeResources } from "./api";
import { callsTo, on, resetApi } from "./fakeApi";

const TITLES = "admin/knowledge-items/titles";

beforeEach(() => {
  resetApi();
  on(
    "GET",
    TITLES,
    ({ searchParams }: { searchParams?: Record<string, string> }) => ({
      items: (searchParams?.ids?.split(",") ?? []).map((id) => ({
        id,
        title: `제목 ${id}`,
      })),
    }),
  );
});

describe("fetchResourceTitles", () => {
  test("id 가 없으면 부르지 않고 빈 객체다", async () => {
    expect(await fetchResourceTitles([])).toEqual({});
    expect(callsTo("GET", TITLES)).toHaveLength(0);
  });

  test("서버 상한 200개씩 나눠 부르고 같은 id 는 한 번만 보낸다", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    const titles = await fetchResourceTitles([...ids, "id0"]);
    const calls = callsTo("GET", TITLES);
    expect(
      calls.map((c) => c.options.searchParams?.ids?.split(",").length),
    ).toEqual([200, 200, 50]);
    expect(Object.keys(titles)).toHaveLength(450);
    expect(titles.id449).toBe("제목 id449");
  });
});

describe("searchKnowledgeResources", () => {
  test("빈 검색어는 부르지 않고 빈 목록이다", async () => {
    expect(await searchKnowledgeResources("topic_pattern", "  ")).toEqual([]);
    expect(callsTo("GET", TITLES)).toHaveLength(0);
  });
});
