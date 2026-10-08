import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn(async () => "token"),
}));

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import {
  postEmbedBackfill,
  postKnowledgeBulk,
  postKnowledgeDedupe,
  postSearchPreview,
} from "./api";

function respond(status: number, body: unknown) {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postKnowledgeDedupe", () => {
  it("서버가 coded 오류를 돌려주면 던지지 않고 그 메시지를 ok:false 로 돌려준다", async () => {
    respond(400, { ok: false, error: { message: "항목이 비었습니다." } });

    await expect(postKnowledgeDedupe("topic_pattern", [])).resolves.toEqual({
      ok: false,
      message: "항목이 비었습니다.",
    });
  });

  it("fetch 가 거부되면 던지지 않고 예외 메시지를 ok:false 로 돌려준다", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(postKnowledgeDedupe("topic_pattern", [])).resolves.toEqual({
      ok: false,
      message: "Failed to fetch",
    });
  });

  it("세션 토큰을 못 얻으면 던지지 않고 그 메시지를 ok:false 로 돌려준다", async () => {
    vi.mocked(getFreshSupabaseAccessTokenOrSignOut).mockRejectedValueOnce(
      new Error(
        "관리자 로그인 세션이 없습니다. 로그아웃 후 다시 로그인하세요.",
      ),
    );

    await expect(postKnowledgeDedupe("topic_pattern", [])).resolves.toEqual({
      ok: false,
      message: "관리자 로그인 세션이 없습니다. 로그아웃 후 다시 로그인하세요.",
    });
  });

  it("성공하면 결과 배열을 data 로 돌려준다", async () => {
    const results = [{ rowNo: 2, exact: [], near: [] }];
    respond(200, { ok: true, results });

    await expect(postKnowledgeDedupe("topic_pattern", [])).resolves.toEqual({
      ok: true,
      data: results,
    });
  });
});

describe("postKnowledgeBulk", () => {
  it("본문 ok 가 없으면 HTTP 상태를 담은 기본 메시지를 ok:false 로 돌려준다", async () => {
    respond(500, null);

    await expect(
      postKnowledgeBulk({
        knowledgeType: "topic_pattern",
        inserts: [],
        updates: [],
      }),
    ).resolves.toEqual({
      ok: false,
      message: "요청에 실패했습니다. (HTTP 500)",
    });
  });

  it("성공하면 반영 건수와 id 를 data 로 돌려준다", async () => {
    respond(200, { ok: true, inserted: 1, updated: 2, ids: ["a"] });

    const result = await postKnowledgeBulk({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [],
    });

    expect(result).toEqual({
      ok: true,
      data: { inserted: 1, updated: 2, ids: ["a"] },
    });
  });
});

describe("postEmbedBackfill", () => {
  it("HTTP 오류면 detail 메시지를 ok:false 로 돌려준다", async () => {
    respond(500, { detail: "임베딩 키가 없습니다." });

    await expect(postEmbedBackfill()).resolves.toEqual({
      ok: false,
      message: "임베딩 키가 없습니다.",
    });
  });

  it("detail 형식이라 본문 ok 없이도 HTTP 성공이면 회차 결과를 돌려준다", async () => {
    respond(200, { embedded: 5, failed: 1 });

    await expect(postEmbedBackfill()).resolves.toEqual({
      ok: true,
      data: { embedded: 5, failed: 1 },
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

  it("서버 오류 메시지를 ok:false 로 돌려준다", async () => {
    respond(400, { ok: false, error: { message: "주제를 입력하세요." } });

    await expect(postSearchPreview(body)).resolves.toEqual({
      ok: false,
      message: "주제를 입력하세요.",
    });
  });

  it("성공하면 모드와 단어 질의를 정리해 data 로 돌려준다", async () => {
    respond(200, {
      ok: true,
      mode: "vector",
      threshold: "0.5",
      queryText: "마찰력",
      keywordQuery: 3,
      items: [],
    });

    await expect(postSearchPreview(body)).resolves.toEqual({
      ok: true,
      data: {
        mode: "vector",
        threshold: 0.5,
        queryText: "마찰력",
        keywordQuery: null,
        items: [],
      },
    });
  });
});
