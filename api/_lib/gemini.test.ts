import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callStructured, callVision, generateWithRetry } from "./gemini.js";
import { createAiTrace } from "./telemetry/trace.js";

// 실제로 나가는 Gemini REST 요청을 가로챈다. `@ai-sdk/google` 은 호출 시점의 전역 fetch 를 쓴다.
const fetchMock = vi.fn();

const CTX = { service: "performance" as const, feature: "recommend_topics" };

const REQUEST = {
  model: "gemini-2.5-flash",
  contents: "안녕하세요",
  config: { systemInstruction: "시스템", temperature: 0.35 },
};

function geminiBody(text = "응답입니다", finishReason = "STOP") {
  return {
    candidates: [
      {
        content: { parts: [{ text }], role: "model" },
        finishReason,
      },
    ],
    usageMetadata: {
      promptTokenCount: 11,
      candidatesTokenCount: 22,
      cachedContentTokenCount: 3,
      thoughtsTokenCount: 4,
      totalTokenCount: 40,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okResponse(text?: string, finishReason?: string) {
  return jsonResponse(geminiBody(text, finishReason));
}

function errorResponse(status: number, message: string, statusText: string) {
  return jsonResponse(
    { error: { code: status, message, status: statusText } },
    status,
  );
}

/** n 번째 요청의 JSON 바디. */
function sentBody(index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateWithRetry 기록", () => {
  it("성공 1회면 토큰 5종과 종료 사유가 담긴 행 1개를 남긴다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const response = await generateWithRetry(REQUEST, 2, trace);
    expect(response.text).toBe("응답입니다");
    expect(response.candidates?.[0]?.finishReason).toBe("STOP");
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

  it("503 뒤 성공이면 오류 행과 성공 행 2개를 남기고 700ms 뒤 다시 부른다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        errorResponse(503, "The model is overloaded.", "UNAVAILABLE"),
      )
      .mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const promise = generateWithRetry(REQUEST, 2, trace);
    await vi.advanceTimersByTimeAsync(699);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(trace.calls).toHaveLength(2);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "503",
      transport_attempt: 1,
    });
    expect(trace.calls[0]?.error_message).toContain("overloaded");
    expect(trace.calls[1]).toMatchObject({
      status: "ok",
      transport_attempt: 2,
    });
  });

  it("상태 코드 없이 본문에 RESOURCE_EXHAUSTED 가 있어도 재시도한다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(errorResponse(500, "quota", "RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce(okResponse());
    const promise = generateWithRetry(REQUEST, 2);
    await vi.advanceTimersByTimeAsync(700);
    await expect(promise).resolves.toMatchObject({ text: "응답입니다" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("재시도를 다 쓰면 마지막 오류를 throw 하고 SDK 자체 재시도는 없다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () =>
      errorResponse(429, "busy", "RESOURCE_EXHAUSTED"),
    );
    const promise = generateWithRetry(REQUEST, 2);
    const settled = expect(promise).rejects.toMatchObject({ statusCode: 429 });
    await vi.advanceTimersByTimeAsync(700 + 1400);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("비재시도 오류는 행 1개를 남기고 한 번만 부른 뒤 throw 한다", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(400, "bad request", "INVALID_ARGUMENT"),
    );
    const trace = createAiTrace(CTX);
    await expect(generateWithRetry(REQUEST, 2, trace)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]).toMatchObject({
      status: "error",
      error_code: "400",
    });
  });

  it("abort 오류는 aborted 코드로 남기고 재시도하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return okResponse();
    });
    const trace = createAiTrace(CTX);
    await expect(
      generateWithRetry(
        {
          ...REQUEST,
          config: { ...REQUEST.config, abortSignal: controller.signal },
        },
        2,
        trace,
      ),
    ).rejects.toThrow();
    expect(trace.calls).toHaveLength(1);
    expect(trace.calls[0]?.error_code).toBe("aborted");
  });

  it("inlineData 의 base64 는 입력 글자 수에 세지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
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
    fetchMock.mockResolvedValueOnce(okResponse());
    await expect(generateWithRetry(REQUEST)).resolves.toMatchObject({
      text: "응답입니다",
    });
    fetchMock.mockResolvedValueOnce(
      errorResponse(400, "nope", "INVALID_ARGUMENT"),
    );
    await expect(generateWithRetry(REQUEST)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("recordCall 이 throw 해도 응답은 정상 반환한다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    vi.spyOn(trace, "recordCall").mockImplementation(() => {
      throw new Error("기록 실패");
    });
    await expect(generateWithRetry(REQUEST, 2, trace)).resolves.toMatchObject({
      text: "응답입니다",
    });
  });

  it("API 키가 없으면 그 호출만 실패하고 요청을 보내지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateWithRetry(REQUEST)).rejects.toThrow("GEMINI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("구조화 출력 응답", () => {
  const STRUCTURED = {
    model: "gemini-2.5-flash",
    contents: "본문",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
      },
    },
  };

  it("모델 원문 JSON 문자열을 text 로 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"a":"값"}'));
    const response = await generateWithRetry(STRUCTURED);
    expect(response.text).toBe('{"a":"값"}');
  });

  it("MAX_TOKENS 로 잘린 JSON 도 throw 없이 원문과 Gemini 종료 사유를 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse('{"a":"잘', "MAX_TOKENS"));
    const trace = createAiTrace(CTX);
    const response = await generateWithRetry(STRUCTURED, 2, trace);
    expect(response.text).toBe('{"a":"잘');
    expect(response.candidates?.[0]?.finishReason).toBe("MAX_TOKENS");
    expect(response.usageMetadata?.promptTokenCount).toBe(11);
    expect(trace.calls[0]).toMatchObject({
      status: "ok",
      finish_reason: "MAX_TOKENS",
    });
  });

  it("STOP 인데 JSON 이 깨져도 throw 없이 원문을 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("not json"));
    const response = await generateWithRetry(STRUCTURED);
    expect(response.text).toBe("not json");
    expect(response.candidates?.[0]?.finishReason).toBe("STOP");
  });
});

describe("callStructured 전달", () => {
  it("options.telemetry 를 기록에 쓰고 요청 바디에는 싣지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const trace = createAiTrace(CTX);
    const result = await callStructured("시스템", "본문", { telemetry: trace });
    expect(result).toEqual({ text: "응답입니다", finishReason: "STOP" });
    expect(trace.calls).toHaveLength(1);
    const body = sentBody();
    expect(JSON.stringify(body)).not.toContain("telemetry");
    expect(body.systemInstruction.parts).toEqual([{ text: "시스템" }]);
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "본문" }] },
    ]);
    expect(body.generationConfig).toEqual({
      temperature: 0.35,
      maxOutputTokens: 1800,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});

describe("callVision 전달", () => {
  it("이미지 2장과 프롬프트를 한 요청의 파트 순서 그대로 보내고 장수 비례 상한을 싣는다", async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await callVision(
      "시스템",
      [
        { data: Buffer.from("one"), mimeType: "image/png" },
        { data: "dHdv", mimeType: "image/jpeg" },
      ],
      "읽어 주세요",
    );
    const body = sentBody();
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: Buffer.from("one").toString("base64"),
            },
          },
          { inlineData: { mimeType: "image/jpeg", data: "dHdv" } },
          { text: "읽어 주세요" },
        ],
      },
    ]);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.25,
      maxOutputTokens: 4400,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
