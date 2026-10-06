// 공용 Gemini 생성 호출 모듈.
//
// 원래 수행평가 전용이었다(`api/_lib/performance/gemini.ts`, 외부 앱
// `/Users/hyunsoo/uwellnow/suhaengpyeong`의 `api/_lib/gemini.js` 이식). 목표관리
// AI 조언(QA 행295·306, `api/goal/advice.ts`)이 같은 재시도·백오프·구조화 출력
// 인프라를 필요로 해 이 경로로 승격했다 — 도메인 중립 이름(`api/_lib/gemini.ts`)으로
// 옮기고, 옛 경로(`api/_lib/performance/gemini.ts`)는 re-export shim만 남겨
// 수행평가 호출부(recommend-topics/design-report/evaluate/analyze-guide)를
// 그대로 둔다.
//
// 이식한 것 (docs/수행평가-상세-명세.md §12.3 「Gemini 재시도 판정·백오프」/「비전 호출 파라미터」)
//   · 재시도 판정식 — `503`/`429`/`'UNAVAILABLE'`/`'high demand'`/`'RESOURCE_EXHAUSTED'`
//     (`suhaengpyeong/api/_lib/gemini.js:12-23`). 운영 관측 없이는 다시 못 만드는 목록이라
//     문자열까지 그대로 옮긴다.
//   · 백오프 — 700ms × 2^attempt, 기본 2회 재시도(`:38`, `:57`).
//   · 모델 — `gemini-2.5-flash`(외부 `_lib/config.js:30`의 `MODEL` 상수와 동일 값).
//   · 기본 파라미터 — 텍스트 temperature 0.35 / maxOutputTokens 1800,
//     비전 temperature 0.25 / maxOutputTokens 2200(**1장 기준**), 양쪽 `thinkingBudget: 0`.
//
// 바꾼 것 3가지 (수행평가 이식 당시)
//   ① **클라이언트 생성을 지연시킨다.** 외부는 모듈 최상단에서 `GEMINI_API_KEY`가 없으면
//      throw한다(`:4-6`). 서버리스에서는 이 모듈을 import하는 모든 라우트가 콜드 스타트
//      단계에서 통째로 죽어 500이 되고 원인 로그도 남지 않는다. 여기서는 실제 호출 시점에
//      만들고, 키가 없으면 그 호출만 실패시킨다(embeddings.js와 같은 관례).
//   ② **`callVision`이 이미지 N장을 받는다.** 외부 시그니처는 `(system, imageBytes, mimeType,
//      prompt)`로 1장 전용이라 프론트가 장당 1회씩 호출했다(`suhaengpyeong/index.html:1660-1681`).
//      §8.8 「다중 분석」 결정이 이를 단일 호출로 통합하므로 `images[]`를 받는다.
//      `contents` 배열 순서가 `[...inlineData, text]`인 것은 외부와 동일하게 유지한다(§12.3).
//   ③ **구조화 출력 통로를 열어 둔다.** `responseMimeType`/`responseSchema`를 `options`로
//      받아 `config`에 실어 보낸다 — 주제 추천 P8 / 설계 리포트 P10 / 평가 P11에 더해
//      목표관리 AI 조언(`api/goal/advice.ts`)도 구조화 출력을 쓴다. **안내문 추출(P7)은
//      쓰지 않는다** — 그 단계의 원본 계약은 평문이다.
//
// 회차 차감은 이 계층 바깥이다 (§12.3 「재시도가 회차 차감과 얽히지 않도록」)
//   여기서 조용히 2번 더 호출해도 차감은 일어나지 않는다. 수행평가 차감 지점은 주제
//   추천 최초 성공 1곳뿐이다(§9.2). 목표관리는 캐시(goal_advice_cache) 자체가
//   레이트리밋이라 별도 차감이 없다.

import type {
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

/** 외부 `_lib/config.js:30`의 `MODEL` 상수와 같은 값. 이름은 수행평가 이식 당시 그대로 유지한다(호출부 무수정 원칙). */
export const PERFORMANCE_MODEL = "gemini-2.5-flash";

/** 비전 호출 `maxOutputTokens` **1장 기준**값(§12.3). 장수 비례 상향은 호출부 몫이다. */
export const VISION_MAX_OUTPUT_TOKENS_PER_IMAGE = 2200;

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 재시도할 가치가 있는 과부하성 오류인가.
 * 판정식은 외부 `api/_lib/gemini.js:12-23` 원문 그대로다 — 실제 과부하 응답 본문에
 * 섞여 나오는 문자열(`'high demand'` 등)까지 잡는 목록이라 운영 관측 없이는 재현이 안 된다.
 */
function isRetryableGeminiError(error: unknown): boolean {
  // Gemini SDK 오류는 공식 타입이 없어 실제 관측된 형태(status/code/message)만 본다.
  const err = error as { status?: number; code?: number; message?: string };
  const status = err?.status || err?.code;
  const message = String(err?.message || "");

  return (
    status === 503 ||
    status === 429 ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

/**
 * 재시도를 감싼 저수준 호출. **응답 객체를 그대로 돌려준다.**
 *
 * `callText`/`callVision`이 `.text`만 꺼내 쓰는 것과 달리 이쪽은 `candidates[].finishReason`
 * 까지 볼 수 있다 — §8.4 완화책 ⓒ("`finishReason === 'MAX_TOKENS'`이면 파싱하지 않고
 * 재시도")를 구현해야 하는 구조화 출력 호출부(P8/P10/P11)를 위해 열어 둔 문이다.
 *
 * @param request `ai.models.generateContent` 요청 객체
 * @param retryCount 추가 시도 횟수(총 호출 = retryCount + 1)
 */
export async function generateWithRetry(
  request: GenerateContentParameters,
  retryCount = 2,
): Promise<GenerateContentResponse> {
  const ai = getGeminiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      lastError = error;

      if (!isRetryableGeminiError(error) || attempt === retryCount) {
        throw error;
      }

      const delayMs = 700 * 2 ** attempt;
      console.warn(
        `[Gemini retry] attempt ${attempt + 1}, waiting ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/** `callText`/`callVision`이 함께 받는 옵션. 실제로 읽는 필드만 담은 최소 형태. */
type GenerateCallOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  retryCount?: number;
  responseMimeType?: string;
  responseSchema?: GenerateContentConfig["responseSchema"];
  abortSignal?: AbortSignal;
};

/**
 * `options`에서 생성 설정을 조립한다. `responseMimeType`/`responseSchema`는 **주어졌을 때만**
 * 실린다 — 평문 계약인 호출(P7 안내문 추출)에 빈 키가 섞이지 않게 하기 위함이다.
 */
function buildConfig(
  system: string,
  options: GenerateCallOptions,
  defaults: { temperature: number; maxOutputTokens: number },
): GenerateContentConfig {
  const config: GenerateContentConfig = {
    systemInstruction: system,
    temperature: options.temperature ?? defaults.temperature,
    maxOutputTokens: options.maxOutputTokens ?? defaults.maxOutputTokens,
    thinkingConfig: { thinkingBudget: options.thinkingBudget ?? 0 },
  };

  // §8.4 ~~Q69~~ 결정 대비 통로. P7은 전달하지 않는다.
  if (options.responseMimeType)
    config.responseMimeType = options.responseMimeType;
  if (options.responseSchema) config.responseSchema = options.responseSchema;

  // 호출부가 스스로 건 마감 시한(`GenerateContentConfig.abortSignal`, @google/genai
  // 타입 정의에 존재). 서버리스 플랫폼이 함수를 죽이기 **전에** 호출부가 실패 처리를
  // 마칠 수 있게 하는 통로다 — 예: analyze-guide.js가 45초 AbortController를 걸어
  // 첨부를 `ocr_status='failed'`로 닫고 502를 돌려준다.
  // 재시도 루프 전체가 이 한 신호를 공유하므로 시한은 "총 예산"이다(abort 오류는
  // `isRetryableGeminiError`에 걸리지 않아 즉시 밖으로 던져진다).
  // ⚠ 라이브러리 주석 그대로 — abort는 클라이언트 측 취소라 이미 시작된 요청의
  //   과금은 취소되지 않는다.
  if (options.abortSignal) config.abortSignal = options.abortSignal;

  return config;
}

/**
 * 구조화 출력(JSON) 생성. `callText`와 같은 요청을 보내되 `finishReason`까지 돌려준다.
 * 구조화 출력은 `MAX_TOKENS`로 잘리면 JSON이 깨지는데, 호출부가 잘림을 알아야
 * 재요청 메모를 "분량을 줄여라"로 바꿀 수 있어서 `callText`와 분리했다.
 *
 * @returns `text`는 응답 텍스트(없으면 빈 문자열), `finishReason`은 첫 후보의 종료 사유(없으면 null)
 */
export async function callStructured(
  system: string,
  userMsg: GenerateContentParameters["contents"],
  options: GenerateCallOptions = {},
): Promise<{ text: string; finishReason: string | null }> {
  const response = await generateWithRetry(
    {
      model: options.model || PERFORMANCE_MODEL,
      contents: userMsg,
      config: buildConfig(system, options, {
        temperature: 0.35,
        maxOutputTokens: 1800,
      }),
    },
    options.retryCount ?? 2,
  );

  return {
    text: response.text || "",
    finishReason: response.candidates?.[0]?.finishReason ?? null,
  };
}

/**
 * 텍스트 전용 생성. 외부 `api/_lib/gemini.js:47-60` 이식.
 *
 * @param system systemInstruction
 * @param userMsg contents
 * @param options `{ model, temperature, maxOutputTokens, thinkingBudget,
 *   retryCount, responseMimeType, responseSchema }`
 * @returns 응답 텍스트(없으면 빈 문자열)
 */
export async function callText(
  system: string,
  userMsg: GenerateContentParameters["contents"],
  options: GenerateCallOptions = {},
): Promise<string> {
  const response = await generateWithRetry(
    {
      model: options.model || PERFORMANCE_MODEL,
      contents: userMsg,
      config: buildConfig(system, options, {
        temperature: 0.35,
        maxOutputTokens: 1800,
      }),
    },
    options.retryCount ?? 2,
  );

  return response.text || "";
}

/**
 * 비전 생성. 외부 `api/_lib/gemini.js:62-87` 이식 + **다중 이미지 단일 호출**(§8.8).
 *
 * `contents`는 `[inlineData × N, { text: prompt }]` 순서다 — 외부의 `[inlineData, text]`
 * 순서를 장수만 늘려 그대로 유지한 것이다(§12.3 「`contents` 배열이 `[inlineData, text]`
 * 순서인 점 유지」).
 *
 * **`maxOutputTokens` 기본값은 장수 비례다.** 외부 기본 2200은 1장 기준이라 그대로 두면
 * 2장부터 출력이 잘린다(§12.3 명시). 호출부가 명시 전달하면 그 값이 우선한다.
 *
 * @param system systemInstruction
 * @param images `data`가 문자열이면 이미 base64로 본다.
 * @param prompt 사용자 프롬프트(이미지 뒤에 붙는 텍스트 파트)
 * @param options `callText`와 동일(+ `abortSignal`)
 * @returns 응답 텍스트(없으면 빈 문자열)
 */
export async function callVision(
  system: string,
  images:
    | { data: Buffer | Uint8Array | ArrayBuffer | string; mimeType: string }
    | { data: Buffer | Uint8Array | ArrayBuffer | string; mimeType: string }[],
  prompt: string,
  options: GenerateCallOptions = {},
): Promise<string> {
  const list = Array.isArray(images) ? images : [images];

  if (!list.length) {
    throw new Error("callVision: 이미지가 최소 1장 필요합니다.");
  }

  const parts = list.map((image) => ({
    inlineData: {
      mimeType: image.mimeType,
      data:
        typeof image.data === "string"
          ? image.data
          : // Buffer.from 오버로드가 Buffer|Uint8Array|ArrayBuffer 유니온을 한 번에 받지
            // 않는다(런타임은 셋 다 지원) — isView로 갈라 각 분기가 단일 오버로드에
            // 맞게 좁혀지게 한다. 두 분기 모두 런타임 동작은 원래의 단일 호출과 같다.
            ArrayBuffer.isView(image.data)
            ? Buffer.from(image.data).toString("base64")
            : Buffer.from(image.data).toString("base64"),
    },
  }));

  const response = await generateWithRetry(
    {
      model: options.model || PERFORMANCE_MODEL,
      contents: [...parts, { text: prompt }],
      config: buildConfig(system, options, {
        temperature: 0.25,
        maxOutputTokens: VISION_MAX_OUTPUT_TOKENS_PER_IMAGE * list.length,
      }),
    },
    options.retryCount ?? 2,
  );

  return response.text || "";
}
