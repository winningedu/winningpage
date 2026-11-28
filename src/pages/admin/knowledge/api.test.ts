import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => {
  class FakeApiError extends Error {
    readonly detail: string;
    constructor(detail: string) {
      super(detail);
      this.detail = detail;
    }
  }
  return {
    FakeApiError,
    post: vi.fn(),
  };
});

vi.mock("@/lib/http/client", () => ({
  ApiError: http.FakeApiError,
  api: { post: http.post },
}));

import {
  postEmbedBackfill,
  postKnowledgeBulk,
  postKnowledgeDedupe,
  postSearchPreview,
} from "./api";

// ky 의 api.post(...).json(schema) 흉내. 본문은 스키마로 검증해 돌려준다.
function respondWith(body: unknown) {
  http.post.mockReturnValue({
    json: async (schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(body),
  });
}

function rejectWith(error: unknown) {
  http.post.mockReturnValue({
    json: async () => {
      throw error;
    },
  });
}

beforeEach(() => {
  http.post.mockReset();
});

describe("postKnowledgeDedupe", () => {
  it("api 로 admin/knowledge-dedupe 를 60초보다 긴 timeout 으로 부른다", async () => {
    respondWith({ items: [] });

    await postKnowledgeDedupe({ knowledgeType: "topic_pattern", items: [] });

    const [path, options] = http.post.mock.calls[0] as [
      string,
      { json: unknown; timeout: number },
    ];
    expect(path).toBe("admin/knowledge-dedupe");
    expect(options.json).toEqual({ knowledgeType: "topic_pattern", items: [] });
    expect(options.timeout).toBeGreaterThan(60_000);
  });

  it("서버 오류는 detail 을 message 로 가진 ApiError 를 그대로 던진다", async () => {
    rejectWith(new http.FakeApiError("항목이 비었습니다."));

    await expect(
      postKnowledgeDedupe({ knowledgeType: "topic_pattern", items: [] }),
    ).rejects.toThrow("항목이 비었습니다.");
  });

  it("응답이 스키마와 다르면 스키마 예외를 던진다", async () => {
    rejectWith(new Error("스키마가 맞지 않습니다."));

    await expect(
      postKnowledgeDedupe({ knowledgeType: "topic_pattern", items: [] }),
    ).rejects.toThrow("스키마가 맞지 않습니다.");
  });

  it("성공하면 items 를 돌려준다", async () => {
    const items = [{ rowNo: 2, exact: [], near: [] }];
    respondWith({ items });

    await expect(
      postKnowledgeDedupe({ knowledgeType: "topic_pattern", items: [] }),
    ).resolves.toEqual(items);
  });
});

describe("postKnowledgeBulk", () => {
  const request = {
    knowledgeType: "topic_pattern" as const,
    inserts: [],
    updates: [],
  };

  it("admin/knowledge-bulk 에 본문을 그대로 보내고 기본 timeout 을 쓴다", async () => {
    respondWith({ inserted: 0, updated: 0, ids: [] });

    await postKnowledgeBulk(request);

    const [path, options] = http.post.mock.calls[0] as [
      string,
      { json: unknown; timeout?: number },
    ];
    expect(path).toBe("admin/knowledge-bulk");
    expect(options.json).toEqual(request);
    expect(options.timeout).toBeUndefined();
  });

  it("실패하면 서버 detail 을 던진다", async () => {
    rejectWith(new http.FakeApiError("이 메뉴에 없는 id 가 있습니다: a"));

    await expect(postKnowledgeBulk(request)).rejects.toThrow(
      "이 메뉴에 없는 id 가 있습니다: a",
    );
  });

  it("성공하면 반영 건수와 id 를 돌려준다", async () => {
    respondWith({ inserted: 1, updated: 2, ids: ["a"] });

    await expect(postKnowledgeBulk(request)).resolves.toEqual({
      inserted: 1,
      updated: 2,
      ids: ["a"],
    });
  });
});

describe("postEmbedBackfill", () => {
  it("performance/admin-embed 에 backfill 을 60초보다 긴 timeout 으로 부른다", async () => {
    respondWith({ embedded: 0, failed: 0 });

    await postEmbedBackfill("verified_resource");

    const [path, options] = http.post.mock.calls[0] as [
      string,
      { json: unknown; timeout: number },
    ];
    expect(path).toBe("performance/admin-embed");
    expect(options.json).toEqual({
      action: "backfill",
      knowledgeType: "verified_resource",
    });
    expect(options.timeout).toBeGreaterThan(60_000);
  });

  it("실패하면 detail 을 던진다", async () => {
    rejectWith(new http.FakeApiError("임베딩 키가 없습니다."));

    await expect(postEmbedBackfill("topic_pattern")).rejects.toThrow(
      "임베딩 키가 없습니다.",
    );
  });

  it("성공하면 회차 결과를 돌려준다", async () => {
    respondWith({ embedded: 5, failed: 1 });

    await expect(postEmbedBackfill("topic_pattern")).resolves.toEqual({
      embedded: 5,
      failed: 1,
    });
  });
});

describe("postSearchPreview", () => {
  const body = {
    knowledgeType: "topic_pattern" as const,
    grade: "",
    subject: "",
    career: "",
    selectedTopic: "",
    assessmentInfo: "",
  };

  it("admin/knowledge-search 를 30초보다 긴 timeout 으로 부른다", async () => {
    respondWith({
      mode: "hybrid",
      threshold: 0.5,
      queryText: "q",
      keywordQuery: "k",
      items: [],
    });

    await postSearchPreview(body);

    const [path, options] = http.post.mock.calls[0] as [
      string,
      { json: unknown; timeout: number },
    ];
    expect(path).toBe("admin/knowledge-search");
    expect(options.json).toEqual(body);
    expect(options.timeout).toBeGreaterThan(30_000);
  });

  it("서버 오류 detail 을 던진다", async () => {
    rejectWith(new http.FakeApiError("주제를 입력하세요."));

    await expect(postSearchPreview(body)).rejects.toThrow("주제를 입력하세요.");
  });

  it("성공하면 모드, 임계값, 단어 질의를 돌려준다", async () => {
    const item = {
      rank: 1,
      id: "k1",
      title: "t",
      grade: "1",
      subject: "s",
      career_field: "c",
      similarity: 0.8,
      passesThreshold: true,
      wouldBeInjected: true,
    };
    respondWith({
      mode: "vector",
      threshold: 0.5,
      queryText: "마찰력",
      keywordQuery: null,
      items: [item],
    });

    await expect(postSearchPreview(body)).resolves.toEqual({
      mode: "vector",
      threshold: 0.5,
      queryText: "마찰력",
      keywordQuery: null,
      items: [item],
    });
  });
});
