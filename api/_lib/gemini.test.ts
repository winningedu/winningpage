import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { createAiTrace } from "./aiTelemetry/trace.js";
import { callStructured, generateWithRetry } from "./gemini.js";

const CTX = { service: "performance" as const, feature: "recommend_topics" };

const REQUEST = {
  model: "gemini-2.5-flash",
  contents: "안녕하세요",
  config: { systemInstruction: "시스템", temperature: 0.35 },
};

function okResponse() {
  return {
    text: "응답입니다",
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: {
      promptTokenCount: 11,
      candidatesTokenCount: 22,
      cachedContentTokenCount: 3,
      thoughtsTokenCount: 4,
      totalTokenCount: 40,
    },
  };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  generateContent.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generateWithRetry 기록", () => {
  it("성공 1회면 토큰 5종과 종료 사유가 담긴 행 1개를 남긴다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const response = await generateWithRetry(REQUEST, 2, trace);
    expect(response.text).toBe("응답입니다");
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]).toMatchObject({
      kind: "generate",
      model: "gemini-2.5-flash",
      status: "ok",
      transport_attempt: 1,
      finish_reason: "STOP",
      prompt_tokens: 11,
      output_tokens: 22,
      cached_tokens: 3,
      thoughts_tokens: 4,
      total_tokens: 40,
      output_chars: "응답입니다".length,
    });
    expect(trace.calls[0]?.input_chars).toBe(
      "안녕하세요".length + "시스템".length,
    );
  });

  it("503 뒤 성공이면 오류 행과 성공 행 2개를 남긴다", async () => {
    vi.useFakeTimers();
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const promise = generateWithRetry(REQUEST, 2, trace);
    await vi.advanceTimersByTimeAsync(700);
    await promise;
    expect(trace.calls).toHaveLength(2);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "503",
      error_message: "busy",
      transport_attempt: 1,
    });
    expect(trace.calls[1]).toMatchObject({
      status: "ok",
      transport_attempt: 2,
    });
  });

  it("비재시도 오류는 행 1개를 남기고 그대로 throw 한다", async () => {
    const error = new Error("bad request");
    generateContent.mockRejectedValueOnce(error);
    const trace = createAiTrace(CTX);
    await expect(generateWithRetry(REQUEST, 2, trace)).rejects.toBe(error);
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "unknown",
    });
  });

  it("abort 오류는 aborted 코드로 남긴다", async () => {
    const error = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    generateContent.mockRejectedValueOnce(error);
    const trace = createAiTrace(CTX);
    await expect(generateWithRetry(REQUEST, 2, trace)).rejects.toBe(error);
    expect(trace.calls[0]?.error_code).toBe("aborted");
  });

  it("inlineData 의 base64 는 입력 글자 수에 세지 않는다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    await generateWithRetry(
      {
        model: "m",
        contents: [
          { inlineData: { mimeType: "image/png", data: "A".repeat(5000) } },
          { text: "설명" },
        ],
      },
      2,
      trace,
    );
    expect(trace.calls[0]?.input_chars).toBeLessThan(100);
  });

  it("telemetry 가 없어도 응답과 throw 동작이 같다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    await expect(generateWithRetry(REQUEST)).resolves.toMatchObject({
      text: "응답입니다",
    });
    const error = new Error("nope");
    generateContent.mockRejectedValueOnce(error);
    await expect(generateWithRetry(REQUEST)).rejects.toBe(error);
  });

  it("recordCall 이 throw 해도 응답은 정상 반환한다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    vi.spyOn(trace, "recordCall").mockImplementation(() => {
      throw new Error("기록 실패");
    });
    await expect(generateWithRetry(REQUEST, 2, trace)).resolves.toMatchObject({
      text: "응답입니다",
    });
  });

  it("요청 객체를 SDK 에 그대로 넘긴다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    await generateWithRetry(REQUEST, 2, createAiTrace(CTX));
    expect(generateContent).toHaveBeenCalledWith(REQUEST);
    expect(generateContent.mock.calls[0]?.[0]).toBe(REQUEST);
  });
});

describe("callStructured 전달", () => {
  it("options.telemetry 를 기록에 쓰고 config 에는 싣지 않는다", async () => {
    generateContent.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const result = await callStructured("시스템", "본문", { telemetry: trace });
    expect(result).toEqual({ text: "응답입니다", finishReason: "STOP" });
    expect(trace.calls).toHaveLength(1);
    const sent = generateContent.mock.calls[0]?.[0];
    expect(Object.keys(sent.config)).not.toContain("telemetry");
    expect(sent.config).toEqual({
      systemInstruction: "시스템",
      temperature: 0.35,
      maxOutputTokens: 1800,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
