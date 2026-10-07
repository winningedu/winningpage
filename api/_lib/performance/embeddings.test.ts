import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiTrace } from "../aiTelemetry/trace.js";
import { embedText } from "./embeddings.js";

// 실제로 나가는 Gemini REST 임베딩 요청을 가로챈다.
const fetchMock = vi.fn();

const CTX = { service: "performance" as const, feature: "embed_backfill" };

const VECTOR = Array.from({ length: 768 }, (_, index) => index / 1000);

function embeddingResponse(values: number[]) {
  return new Response(JSON.stringify({ embedding: { values } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("embedText 기록", () => {
  it("성공하면 embed 행을 남기고 벡터를 그대로 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(embeddingResponse(VECTOR));
    const trace = createAiTrace(CTX);
    await expect(embedText(" 안녕 ", trace)).resolves.toEqual(VECTOR);
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]).toMatchObject({
      kind: "embed",
      model: "gemini-embedding-2",
      status: "ok",
      transport_attempt: 1,
      input_chars: 2,
      prompt_tokens: null,
      total_tokens: null,
    });
  });

  it("기본 모델과 768 차원, 다듬은 입력을 그대로 보내고 지시문을 덧붙이지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(embeddingResponse(VECTOR));
    await embedText(" 안녕 ");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-embedding-2:embedContent");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "models/gemini-embedding-2",
      content: { parts: [{ text: "안녕" }] },
      outputDimensionality: 768,
    });
  });

  it("빈 응답이면 empty_embedding 오류 행을 남기고 throw 한다", async () => {
    fetchMock.mockResolvedValueOnce(embeddingResponse([]));
    const trace = createAiTrace(CTX);
    await expect(embedText("본문", trace)).rejects.toThrow(
      "embedding 값이 비어",
    );
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "empty_embedding",
    });
  });

  it("차원이 설정과 다르면 dimension_mismatch 오류 행을 남기고 throw 한다", async () => {
    fetchMock.mockResolvedValueOnce(embeddingResponse([0.1, 0.2]));
    const trace = createAiTrace(CTX);
    await expect(embedText("본문", trace)).rejects.toThrow("768");
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "dimension_mismatch",
    });
  });

  it("API 오류도 오류 행으로 남기고 재시도 없이 throw 한다", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );
    const trace = createAiTrace(CTX);
    await expect(embedText("본문", trace)).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "429",
    });
    expect(trace.calls[0]?.error_message).toContain("quota");
  });

  it("빈 입력은 호출 없이 throw 하고 행도 남기지 않는다", async () => {
    const trace = createAiTrace(CTX);
    await expect(embedText("  ", trace)).rejects.toThrow("비어 있습니다");
    expect(trace.calls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("telemetry 가 없어도 동작이 같다", async () => {
    fetchMock.mockResolvedValueOnce(embeddingResponse(VECTOR));
    await expect(embedText("본문")).resolves.toEqual(VECTOR);
  });
});
