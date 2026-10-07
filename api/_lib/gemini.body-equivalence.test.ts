// 요청 바디 동등성 검증.
//
// 같은 Gemini 형식 요청을 옛 호출 계층(`@google/genai`)과 새 호출 계층(`generateWithRetry`,
// AI SDK)으로 각각 보내고, 전역 fetch 를 가로채 실제로 나가는 REST 바디를 비교한다.
// 옛 SDK 는 스키마를 OpenAPI 형식(`responseSchema`)으로, 새 공급자는 JSON Schema 형식
// (`responseJsonSchema`)으로 보내므로 두 스키마를 같은 정규형으로 바꿔 의미를 비교한다.
// `@google/genai` 는 이 비교의 기준값을 만들려고 devDependencies 에만 남겨 둔다.

import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWithRetry } from "./gemini.js";
import { ADVICE_RESPONSE_SCHEMA } from "./goalAdvice.js";
import { EXTRACTION_RESPONSE_SCHEMA } from "./growth/intake/extraction.js";
import { STEP_RESPONSE_SCHEMAS } from "./growth/report/prompts.js";
import { RESPONSE_SCHEMAS } from "./inquiry/prompts.js";
import {
  DESIGN_GENERATION_DEFAULTS,
  DESIGN_REPORT_SCHEMA,
  EVALUATION_REPORT_SCHEMA,
  TOPIC_GENERATION_DEFAULTS,
  TOPIC_RECOMMENDATION_SCHEMA,
} from "./performance/prompts.js";
import {
  buildAnalyzePrompt,
  buildVerifyPrompt,
  buildWritePrompt,
} from "./selfeval/prompts.js";
import { ANALYSIS_FIELDS } from "./selfeval/types.js";

type Body = Record<string, unknown> & {
  contents?: Array<{ role?: string; parts: unknown[] }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: Record<string, unknown>;
};

const fetchMock = vi.fn();

function okResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: "{}" }], role: "model" },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 1, totalTokenCount: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function lastBody(): Body {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

type Request = Parameters<typeof generateWithRetry>[0];

/** 같은 요청을 옛 SDK 와 새 계층으로 보내고 두 바디를 돌려준다. */
async function captureBoth(request: Request) {
  await new GoogleGenAI({ apiKey: "test-key" }).models.generateContent(
    request as never,
  );
  const legacy = lastBody();
  await generateWithRetry(request, 0);
  const next = lastBody();
  return { legacy, next };
}

type Canonical = {
  type: string | undefined;
  nullable: boolean;
  properties?: Array<[string, Canonical]>;
  items?: Canonical;
  required?: string[];
  enum?: unknown[];
  pattern?: unknown;
  minItems?: number;
  maxItems?: number;
  description?: unknown;
  format?: unknown;
};

/**
 * 두 형식의 스키마를 같은 정규형으로 바꾼다. type 은 소문자, nullable 은 불리언,
 * properties 는 생성 순서(propertyOrdering 이 있으면 그 순서, 없으면 키 순서)의 배열이다.
 */
function canonical(node: Record<string, unknown>): Canonical {
  const rawType = node.type;
  const types = (Array.isArray(rawType) ? rawType : [rawType])
    .filter((t) => t != null)
    .map((t) => String(t).toLowerCase());
  const result: Canonical = {
    type: types.find((t) => t !== "null"),
    nullable: node.nullable === true || types.includes("null"),
  };
  const props = node.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (props) {
    const ordering = node.propertyOrdering as string[] | undefined;
    const keys = ordering ?? Object.keys(props);
    result.properties = keys.map((key) => [
      key,
      canonical(props[key] as Record<string, unknown>),
    ]);
  }
  if (node.items) {
    result.items = canonical(node.items as Record<string, unknown>);
  }
  if (node.required) result.required = [...(node.required as string[])];
  if (node.enum) result.enum = [...(node.enum as unknown[])];
  if (node.pattern !== undefined) result.pattern = node.pattern;
  if (node.minItems !== undefined) result.minItems = Number(node.minItems);
  if (node.maxItems !== undefined) result.maxItems = Number(node.maxItems);
  if (node.description !== undefined) result.description = node.description;
  if (node.format !== undefined) result.format = node.format;
  return result;
}

/** 두 바디가 같은 뜻의 요청인지 확인한다. */
function expectEquivalent(legacy: Body, next: Body) {
  expect(next.contents).toEqual(legacy.contents);
  expect(next.systemInstruction?.parts).toEqual(
    legacy.systemInstruction?.parts,
  );
  const legacyConfig = legacy.generationConfig ?? {};
  const nextConfig = next.generationConfig ?? {};
  for (const key of [
    "temperature",
    "maxOutputTokens",
    "thinkingConfig",
    "responseMimeType",
  ]) {
    expect(nextConfig[key], key).toEqual(legacyConfig[key]);
  }
  if (legacyConfig.responseSchema) {
    expect(nextConfig.responseSchema).toBeUndefined();
    expect(
      canonical(nextConfig.responseJsonSchema as Record<string, unknown>),
    ).toEqual(
      canonical(legacyConfig.responseSchema as Record<string, unknown>),
    );
  } else {
    expect(nextConfig.responseJsonSchema).toBeUndefined();
  }
  // 새 계층이 옛 바디에 없던 생성 설정을 몰래 더하지 않는다.
  const extra = Object.keys(nextConfig).filter(
    (key) => key !== "responseJsonSchema" && !(key in legacyConfig),
  );
  expect(extra).toEqual([]);
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("대표 요청 4종의 바디가 옛 SDK 와 같은 뜻이다", () => {
  it("주제 추천 구조화 출력", async () => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: "고1 국어 수행평가 주제를 추천해 주세요.",
      config: {
        systemInstruction: "너는 수행평가 주제 추천 도우미다.",
        temperature: TOPIC_GENERATION_DEFAULTS.temperature,
        maxOutputTokens: TOPIC_GENERATION_DEFAULTS.maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: TOPIC_RECOMMENDATION_SCHEMA,
      },
    });
    expectEquivalent(legacy, next);
    expect(next.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
    const sentConfig = next.generationConfig as Record<string, unknown>;
    const sentSchema = sentConfig.responseJsonSchema as {
      properties: { topics: { items: { properties: object } } };
    };
    const topicItem = sentSchema.properties.topics.items;
    expect(Object.keys(topicItem.properties)).toEqual(
      TOPIC_RECOMMENDATION_SCHEMA.properties.topics.items.propertyOrdering,
    );
  });

  it("설계 리포트 구조화 출력", async () => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: "설계 리포트를 써 주세요.",
      config: {
        systemInstruction: "설계 리포트 시스템",
        temperature: DESIGN_GENERATION_DEFAULTS.temperature,
        maxOutputTokens: DESIGN_GENERATION_DEFAULTS.maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: DESIGN_REPORT_SCHEMA,
      },
    });
    expectEquivalent(legacy, next);
  });

  it("비전 2장", async () => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: [
        { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
        { inlineData: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" } },
        { text: "두 장을 읽어 주세요." },
      ],
      config: {
        systemInstruction: "안내문 추출",
        temperature: 0.25,
        maxOutputTokens: 4400,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    expectEquivalent(legacy, next);
  });

  it("평문", async () => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: "평문으로 답해 주세요.",
      config: {
        systemInstruction: "평문 시스템",
        temperature: 0.35,
        maxOutputTokens: 1800,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    expectEquivalent(legacy, next);
  });
});

describe("빈 systemInstruction", () => {
  it("새 계층은 빈 지시문을 싣지 않는다", async () => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: "본문",
      config: { systemInstruction: "", temperature: 0.35 },
    });
    expect(next.systemInstruction).toBeUndefined();
    expect(next.contents).toEqual(legacy.contents);
    const legacyText = legacy.systemInstruction?.parts
      ?.map((part) => part.text)
      .join("");
    expect(legacyText ?? "").toBe("");
  });
});

const record = {
  id: "a1",
  sourceProgram: "performance" as const,
  status: "confirmed" as const,
  gradeLabel: "고1" as const,
  semester: 1 as const,
  subjectGroup: null,
  subject: "수학",
  topic: "이차함수 꼭짓점 탐구",
  concept: "판별식",
  method: "그래프 프로그램 사용",
  result: "폭이 좁아짐",
  limitation: "정수 계수만",
  numbers: [],
  sources: [],
  createdAt: "2026-01-01",
};

function emptyAnalysis() {
  const values = Object.fromEntries(ANALYSIS_FIELDS.map((f) => [f, ""]));
  const sources = Object.fromEntries(ANALYSIS_FIELDS.map((f) => [f, "empty"]));
  return { values, sources, conflicts: [] } as never;
}

const SCHEMAS: Array<[string, Record<string, unknown>]> = [
  ["수행평가 주제 추천", TOPIC_RECOMMENDATION_SCHEMA],
  ["수행평가 설계 리포트", DESIGN_REPORT_SCHEMA],
  ["수행평가 평가 리포트", EVALUATION_REPORT_SCHEMA],
  ["목표관리 조언", ADVICE_RESPONSE_SCHEMA],
  ["성장 추출", EXTRACTION_RESPONSE_SCHEMA as Record<string, unknown>],
  ...Object.entries(STEP_RESPONSE_SCHEMAS).map(
    ([step, schema]): [string, Record<string, unknown>] => [
      `성장설계 단계 ${step}`,
      schema as Record<string, unknown>,
    ],
  ),
  ...Object.entries(RESPONSE_SCHEMAS).map(
    ([mode, schema]): [string, Record<string, unknown>] => [
      `심화탐구 ${mode}`,
      schema as Record<string, unknown>,
    ],
  ),
  [
    "자기평가서 analyze",
    buildAnalyzePrompt({
      record,
      area: "subject",
      subject: "수학",
      activityName: "탐구",
    }).responseSchema,
  ],
  [
    "자기평가서 write",
    buildWritePrompt({
      core: {
        activityName: "탐구",
        activityId: "a1",
        analysis: emptyAnalysis(),
      },
      supports: [],
      area: "subject",
      subject: "수학",
      activityName: null,
      schoolPrompt: "동기를 쓰시오",
      promptKeywords: [],
      teacherNote: null,
      targetChars: 800,
      mode: "without_space",
      career: { career: null, department: null },
      growth: null,
    }).responseSchema,
  ],
  [
    "자기평가서 verify",
    buildVerifyPrompt({
      text: "본문",
      sentences: [],
      schoolPrompt: "동기를 쓰시오",
      promptKeywords: [],
      teacherNote: null,
      coreTerms: { concepts: [], roles: [], sources: [] },
      supportNames: [],
      growth: null,
    }).responseSchema,
  ],
];

describe("저장소의 응답 스키마 전부가 같은 뜻으로 나간다", () => {
  it.each(SCHEMAS)("%s", async (_name, schema) => {
    const { legacy, next } = await captureBoth({
      model: "gemini-2.5-flash",
      contents: "본문",
      config: {
        systemInstruction: "시스템",
        temperature: 0.3,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    expectEquivalent(legacy, next);
  });
});
