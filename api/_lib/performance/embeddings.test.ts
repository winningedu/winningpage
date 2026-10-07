import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { embedContent };
  },
}));

import { createAiTrace } from "../aiTelemetry/trace.js";
import { embedText } from "./embeddings.js";

const CTX = { service: "performance" as const, feature: "embed_backfill" };

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  embedContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedText 기록", () => {
  it("성공하면 embed 행을 남기고 벡터를 그대로 돌려준다", async () => {
    embedContent.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2] }],
    });
    const trace = createAiTrace(CTX);
    await expect(embedText(" 안녕 ", trace)).resolves.toEqual([0.1, 0.2]);
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]).toMatchObject({
      kind: "embed",
      status: "ok",
      transport_attempt: 1,
      input_chars: 2,
      prompt_tokens: null,
      total_tokens: null,
    });
  });

  it("빈 응답이면 empty_embedding 오류 행을 남기고 throw 한다", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{ values: [] }] });
    const trace = createAiTrace(CTX);
    await expect(embedText("본문", trace)).rejects.toThrow(
      "embedding 값이 비어",
    );
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "empty_embedding",
    });
  });

  it("SDK 오류도 오류 행으로 남기고 그대로 throw 한다", async () => {
    const error = Object.assign(new Error("quota"), { status: 429 });
    embedContent.mockRejectedValueOnce(error);
    const trace = createAiTrace(CTX);
    await expect(embedText("본문", trace)).rejects.toBe(error);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "429",
      error_message: "quota",
    });
  });

  it("빈 입력은 호출 없이 throw 하고 행도 남기지 않는다", async () => {
    const trace = createAiTrace(CTX);
    await expect(embedText("  ", trace)).rejects.toThrow("비어 있습니다");
    expect(trace.calls).toHaveLength(0);
    expect(embedContent).not.toHaveBeenCalled();
  });

  it("telemetry 가 없어도 동작이 같다", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1] }] });
    await expect(embedText("본문")).resolves.toEqual([1]);
  });
});
