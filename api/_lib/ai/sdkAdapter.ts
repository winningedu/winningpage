// Gemini 형식 요청을 AI SDK(`ai` + `@ai-sdk/google`) 호출 인자로 바꾸는 순수 함수 모음.
//
// 호출부와 프롬프트 파일은 지금까지 Gemini REST 형식(`contents`, `config.systemInstruction`,
// `config.responseSchema` 등)으로 요청을 만들어 왔다. 그 모양을 그대로 받아 AI SDK 인자로
// 옮기는 일을 여기 한 곳에 모은다. 네트워크와 환경변수는 다루지 않는다.

/** Gemini 스키마 노드. 프롬프트 파일이 쓰는 키(type, properties, required 등)를 자유롭게 담는다. */
export type GeminiSchema = Record<string, unknown>;

/** JSON Schema 노드. `@ai-sdk/google` 은 이것을 `responseJsonSchema` 로 그대로 보낸다. */
export type JsonSchemaNode = Record<string, unknown>;

/** 이미지 파트. `data` 는 base64 문자열이다. */
export type GeminiInlineDataPart = {
  inlineData: { mimeType: string; data: string };
};

/** 텍스트 파트. */
export type GeminiTextPart = { text: string };

/** 요청 본문. 문자열이면 텍스트 1건, 배열이면 user 메시지 1개의 파트 목록이다. */
export type GeminiContents =
  | string
  | Array<GeminiInlineDataPart | GeminiTextPart>;

/** 호출부가 쓰는 Gemini 생성 설정의 최소 형태. */
export type GeminiGenerateConfig = {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: { thinkingBudget?: number };
  responseMimeType?: string;
  responseSchema?: GeminiSchema;
  abortSignal?: AbortSignal;
};

/** `generateWithRetry` 가 받는 Gemini 형식 요청. */
export type GeminiGenerateRequest = {
  model: string;
  contents: GeminiContents;
  config?: GeminiGenerateConfig;
};

/** AI SDK 메시지 파트. 이미지는 file 파트로 보낸다. */
type AiSdkContentPart =
  | { type: "file"; data: string; mediaType: string }
  | { type: "text"; text: string };

/** 출력 계약. text 는 평문, json 은 스키마 없는 JSON, object 는 스키마를 강제하는 JSON 이다. */
export type AiSdkOutputPlan =
  | { kind: "text" }
  | { kind: "json" }
  | { kind: "object"; schema: JsonSchemaNode };

/** `generateText` 에 넘길 인자의 재료. model 과 output 객체 생성은 호출 쪽 몫이다. */
export type AiSdkCall = {
  modelId: string;
  instructions?: string;
  prompt?: string;
  messages?: Array<{ role: "user"; content: AiSdkContentPart[] }>;
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  providerOptions?: {
    google: { thinkingConfig?: { thinkingBudget?: number } };
  };
  output: AiSdkOutputPlan;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function lowerType(type: unknown): unknown {
  if (typeof type === "string") return type.toLowerCase();
  if (Array.isArray(type)) return type.map(lowerType);
  return type;
}

/**
 * Gemini 스키마(OpenAPI 부분집합)를 JSON Schema 로 바꾼다.
 *
 * properties 키는 propertyOrdering 이 있으면 그 순서로 다시 놓는다. 2.5 이상 모델은
 * `responseJsonSchema` 의 키 순서대로 필드를 생성하므로 propertyOrdering 의 뜻이 키 순서로 옮겨 간다.
 */
export function geminiSchemaToJsonSchema(schema: GeminiSchema): JsonSchemaNode {
  const { propertyOrdering, properties, items, type, nullable, ...rest } =
    schema;
  const result: JsonSchemaNode = { ...rest };

  if (type !== undefined) {
    const lowered = lowerType(type);
    // nullable 은 OpenAPI 키라 JSON Schema 에서는 type 배열의 null 로 옮긴다.
    result.type =
      nullable === true && typeof lowered === "string"
        ? [lowered, "null"]
        : lowered;
  }

  if (isPlainObject(properties)) {
    const order = Array.isArray(propertyOrdering)
      ? [
          ...propertyOrdering.filter(
            (key): key is string =>
              typeof key === "string" && key in properties,
          ),
          ...Object.keys(properties).filter(
            (key) => !propertyOrdering.includes(key),
          ),
        ]
      : Object.keys(properties);
    result.properties = Object.fromEntries(
      order.map((key) => [
        key,
        geminiSchemaToJsonSchema(properties[key] as GeminiSchema),
      ]),
    );
  }

  if (isPlainObject(items)) {
    result.items = geminiSchemaToJsonSchema(items);
  }

  return result;
}

/** Gemini 형식 요청을 AI SDK 호출 재료로 바꾼다. 값이 없는 설정은 키째 싣지 않는다. */
export function toAiSdkCall(request: GeminiGenerateRequest): AiSdkCall {
  const config = request.config ?? {};
  const call: AiSdkCall = {
    modelId: String(request.model),
    output: { kind: "text" },
  };

  if (config.systemInstruction) call.instructions = config.systemInstruction;
  if (typeof request.contents === "string") {
    call.prompt = request.contents;
  } else {
    // 비전 호출의 `[inlineData x N, { text }]` 순서를 파트 순서 그대로 옮긴다.
    call.messages = [
      {
        role: "user",
        content: request.contents.map(
          (part): AiSdkContentPart =>
            "inlineData" in part
              ? {
                  type: "file",
                  data: part.inlineData.data,
                  mediaType: part.inlineData.mimeType,
                }
              : { type: "text", text: part.text },
        ),
      },
    ];
  }
  if (config.temperature !== undefined) call.temperature = config.temperature;
  if (config.maxOutputTokens !== undefined)
    call.maxOutputTokens = config.maxOutputTokens;
  if (config.abortSignal) call.abortSignal = config.abortSignal;
  if (config.thinkingConfig) {
    call.providerOptions = {
      google: { thinkingConfig: config.thinkingConfig },
    };
  }

  if (config.responseMimeType === "application/json") {
    call.output = config.responseSchema
      ? {
          kind: "object",
          schema: geminiSchemaToJsonSchema(config.responseSchema),
        }
      : { kind: "json" };
  }

  return call;
}

/** 계기판과 호출부가 읽는 Gemini usageMetadata 필드. */
export type GeminiUsageMetadata = {
  promptTokenCount?: number | null | undefined;
  candidatesTokenCount?: number | null | undefined;
  cachedContentTokenCount?: number | null | undefined;
  thoughtsTokenCount?: number | null | undefined;
  totalTokenCount?: number | null | undefined;
};

/** `generateWithRetry` 가 돌려주는 응답. 호출부가 읽는 필드만 담는다. */
export type GeminiGenerateResponse = {
  text: string;
  candidates: Array<{ finishReason: string | null }>;
  usageMetadata: GeminiUsageMetadata | null;
};

/** AI SDK `LanguageModelUsage` 에서 이 변환이 읽는 필드. */
type AiSdkUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined } | undefined;
  outputTokenDetails?: { reasoningTokens?: number | undefined } | undefined;
};

/** AI SDK 공통 종료 사유를 Gemini 원문 값으로 되돌린다. */
const FINISH_REASON_TO_GEMINI: Record<string, string> = {
  stop: "STOP",
  length: "MAX_TOKENS",
  "content-filter": "SAFETY",
};

/** 원본 바디가 Gemini 응답 모양일 때 읽는 필드. */
type GeminiRawBody = {
  candidates?: Array<{ finishReason?: string | null }> | null;
  usageMetadata?: GeminiUsageMetadata | null;
};

/**
 * AI SDK 결과를 Gemini 응답 모양으로 바꾼다.
 *
 * 종료 사유와 usageMetadata 는 원문을 우선한다. 원본 응답 바디, providerMetadata.google,
 * AI SDK 공통 값 순서로 찾는다. 원문을 우선하는 까닭은 호출부가 `MAX_TOKENS` 같은
 * Gemini 값을 직접 비교하고, 계기판이 Gemini 의 토큰 필드를 그대로 기록하기 때문이다.
 */
export function toGeminiResponse(source: {
  text: string;
  body?: unknown;
  finishReason?: string | undefined;
  usage?: AiSdkUsage | undefined;
  providerMetadata?: unknown;
}): GeminiGenerateResponse {
  const body = (isPlainObject(source.body) ? source.body : {}) as GeminiRawBody;
  const google = (
    isPlainObject(source.providerMetadata) &&
    isPlainObject(source.providerMetadata.google)
      ? source.providerMetadata.google
      : {}
  ) as { finishReason?: string | null; usageMetadata?: GeminiUsageMetadata };

  const finishReason =
    body.candidates?.[0]?.finishReason ??
    google.finishReason ??
    (source.finishReason
      ? (FINISH_REASON_TO_GEMINI[source.finishReason] ?? "OTHER")
      : null);

  const usage = source.usage;
  const usageMetadata =
    body.usageMetadata ??
    google.usageMetadata ??
    (usage
      ? {
          promptTokenCount: usage.inputTokens,
          candidatesTokenCount: usage.outputTokens,
          cachedContentTokenCount: usage.inputTokenDetails?.cacheReadTokens,
          thoughtsTokenCount: usage.outputTokenDetails?.reasoningTokens,
          totalTokenCount: usage.totalTokens,
        }
      : null);

  return {
    text: source.text,
    candidates: [{ finishReason }],
    usageMetadata,
  };
}
