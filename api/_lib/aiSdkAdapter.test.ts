import { describe, expect, it } from "vitest";
import {
  geminiSchemaToJsonSchema,
  toAiSdkCall,
  toGeminiResponse,
} from "./aiSdkAdapter.js";

describe("geminiSchemaToJsonSchema", () => {
  it("대문자 type 을 소문자로 바꾸고 propertyOrdering 순서로 properties 키를 다시 놓는다", () => {
    const converted = geminiSchemaToJsonSchema({
      type: "OBJECT",
      properties: {
        b: { type: "STRING" },
        a: { type: "INTEGER" },
      },
      required: ["a", "b"],
      propertyOrdering: ["a", "b"],
    });
    expect(converted).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "string" } },
      required: ["a", "b"],
    });
    expect(Object.keys(converted.properties as object)).toEqual(["a", "b"]);
    expect(converted).not.toHaveProperty("propertyOrdering");
  });

  it("nullable 은 type 배열에 null 을 더하는 형태로 바꾸고 이미 배열인 type 은 그대로 둔다", () => {
    expect(
      geminiSchemaToJsonSchema({
        type: "object",
        nullable: true,
        properties: { id: { type: "string" } },
      }),
    ).toEqual({
      type: ["object", "null"],
      properties: { id: { type: "string" } },
    });
    expect(geminiSchemaToJsonSchema({ type: ["string", "null"] })).toEqual({
      type: ["string", "null"],
    });
    expect(
      geminiSchemaToJsonSchema({ type: "STRING", nullable: false }),
    ).toEqual({ type: "string" });
  });

  it("items 안쪽과 enum, pattern, minItems, maxItems, description 을 보존한다", () => {
    expect(
      geminiSchemaToJsonSchema({
        type: "ARRAY",
        minItems: 3,
        maxItems: 3,
        description: "목록",
        items: {
          type: "OBJECT",
          properties: {
            score: { type: "STRING", pattern: "^\\d{1,3}$" },
            role: { type: "STRING", enum: ["a", "b"] },
          },
          required: ["score"],
        },
      }),
    ).toEqual({
      type: "array",
      minItems: 3,
      maxItems: 3,
      description: "목록",
      items: {
        type: "object",
        properties: {
          score: { type: "string", pattern: "^\\d{1,3}$" },
          role: { type: "string", enum: ["a", "b"] },
        },
        required: ["score"],
      },
    });
  });
});

describe("toAiSdkCall", () => {
  it("평문 요청은 instructions, prompt, 생성 설정, thinkingConfig 로 옮기고 출력 스키마를 두지 않는다", () => {
    const signal = new AbortController().signal;
    expect(
      toAiSdkCall({
        model: "gemini-2.5-flash",
        contents: "본문",
        config: {
          systemInstruction: "시스템",
          temperature: 0.35,
          maxOutputTokens: 1800,
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: signal,
        },
      }),
    ).toEqual({
      modelId: "gemini-2.5-flash",
      instructions: "시스템",
      prompt: "본문",
      temperature: 0.35,
      maxOutputTokens: 1800,
      abortSignal: signal,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      output: { kind: "text" },
    });
  });

  it("이미지 N장과 텍스트 파트는 user 메시지 1개의 content 로 순서 그대로 옮긴다", () => {
    const call = toAiSdkCall({
      model: "m",
      contents: [
        { inlineData: { mimeType: "image/png", data: "AAAA" } },
        { inlineData: { mimeType: "image/jpeg", data: "BBBB" } },
        { text: "설명" },
      ],
    });
    expect(call.prompt).toBeUndefined();
    expect(call.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "file", data: "AAAA", mediaType: "image/png" },
          { type: "file", data: "BBBB", mediaType: "image/jpeg" },
          { type: "text", text: "설명" },
        ],
      },
    ]);
  });

  it("application/json 과 responseSchema 가 함께 오면 변환한 JSON Schema 로 object 출력을 고른다", () => {
    const call = toAiSdkCall({
      model: "m",
      contents: "본문",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { z: { type: "string" }, a: { type: "string" } },
          propertyOrdering: ["z", "a"],
        },
      },
    });
    expect(call.output).toEqual({
      kind: "object",
      schema: {
        type: "object",
        properties: { z: { type: "string" }, a: { type: "string" } },
      },
    });
  });

  it("responseSchema 없이 application/json 만 오면 스키마 없는 json 출력을 고른다", () => {
    expect(
      toAiSdkCall({
        model: "m",
        contents: "본문",
        config: { responseMimeType: "application/json" },
      }).output,
    ).toEqual({ kind: "json" });
  });
});

describe("toGeminiResponse", () => {
  const USAGE = {
    inputTokens: 10,
    inputTokenDetails: {
      noCacheTokens: 8,
      cacheReadTokens: 2,
      cacheWriteTokens: undefined,
    },
    outputTokens: 5,
    outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
    totalTokens: 15,
  };

  it("원본 응답 바디가 있으면 그 종료 사유와 usageMetadata 를 그대로 쓴다", () => {
    expect(
      toGeminiResponse({
        text: "t",
        body: {
          candidates: [{ finishReason: "MAX_TOKENS" }],
          usageMetadata: { promptTokenCount: 1, totalTokenCount: 2 },
        },
        finishReason: "length",
        usage: USAGE,
      }),
    ).toEqual({
      text: "t",
      candidates: [{ finishReason: "MAX_TOKENS" }],
      usageMetadata: { promptTokenCount: 1, totalTokenCount: 2 },
    });
  });

  it("바디가 없으면 providerMetadata.google 의 원문 값을 쓴다", () => {
    expect(
      toGeminiResponse({
        text: "t",
        finishReason: "stop",
        usage: USAGE,
        providerMetadata: {
          google: {
            finishReason: "STOP",
            usageMetadata: { promptTokenCount: 7 },
          },
        },
      }),
    ).toMatchObject({
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 7 },
    });
  });

  it("원문이 하나도 없으면 AI SDK 종료 사유와 usage 로 Gemini 모양을 채운다", () => {
    const mapped = (finishReason: string) =>
      toGeminiResponse({ text: "", finishReason, usage: USAGE }).candidates[0]
        ?.finishReason;
    expect(mapped("stop")).toBe("STOP");
    expect(mapped("length")).toBe("MAX_TOKENS");
    expect(mapped("content-filter")).toBe("SAFETY");
    expect(mapped("other")).toBe("OTHER");
    expect(
      toGeminiResponse({ text: "", finishReason: "stop", usage: USAGE })
        .usageMetadata,
    ).toEqual({
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      cachedContentTokenCount: 2,
      thoughtsTokenCount: 0,
      totalTokenCount: 15,
    });
  });
});
