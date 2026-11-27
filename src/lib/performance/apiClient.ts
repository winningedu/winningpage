// STEP3/4/5 AI 호출 공용 timeout — docs/수행평가-상세-명세.md §8.6.
//
// `recommend-topics`/`design-report`/`evaluate`는 서버 `maxDuration: 60`(analyze-guide.js:658,
// design-report.js:1217, evaluate.js:816, recommend-topics.js:840)이 걸려 있다. 브라우저
// fetch는 별도 timeout이 없어 플랫폼이 함수를 죽인 뒤(504)에도 응답을 기다리거나, 네트워크가
// 끊겨도 무한 대기할 수 있다. 여기서는 서버 예산(60초)보다 넉넉한 클라이언트 timeout을 걸어
// 강제 종료하고, `error.code = 'TIMEOUT'`을 실어 던진다 — 각 호출부의 기존 catch(error)
// 블록이 이 에러도 똑같이 잡아 기존 실패 카드로 흡수한다(신규 UI 불필요).
//
// fetchWithTimeout 은 아직 옮기지 않은 심화탐구, 성장설계 api 가 쓴다. 수행평가 호출부는 ky 클라이언트에
// AI_CALL_TIMEOUT_MS 를 timeout 으로 넘기고 실패는 아래 performanceRequest 로 읽는다.

import { ApiFetchTimeoutError, apiFetch } from "../apiFetch";
import { ApiError } from "../http/client";

/** 모델을 부르지 않는 수행평가 쓰기 호출(finalize, 업로드 토큰, 회수)의 timeout. */
export const DEFAULT_TIMEOUT_MS = 30000;

/** AI 호출처럼 서버 `maxDuration: 60`이 걸린 엔드포인트에 쓰는 넉넉한 timeout. */
export const AI_CALL_TIMEOUT_MS = 70000;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await apiFetch(url, options, { timeoutMs });
  } catch (error) {
    if (error instanceof ApiFetchTimeoutError) {
      const timeoutError = new Error(
        "요청이 시간 내에 끝나지 않았어요.",
      ) as Error & {
        code?: string;
      };
      timeoutError.code = "TIMEOUT";
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  }
}

/**
 * 수행평가 호출 결과(/api/performance/*, ky 클라이언트). HTTP 실패는 던지지 않고 서버의 code, 문구, 확장 멤버로 돌려준다.
 * 서버는 problem(RFC 9457)으로 답하고, 예전 { error: { code, message } } 의 형제 키(tenantReason, max 등)는 확장 멤버다.
 * 서버에 닿지 못한 실패(네트워크, 타임아웃)와 계약 불일치(SchemaValidationError)는 그대로 던진다. 호출부가 NETWORK 로 감싼다.
 */
export type PerformanceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      /** 서버가 준 문구. problem 이 아닌 본문(504 빈 본문 등)이면 null 이라 호출부가 폴백 문구를 쓴다. */
      message: string | null;
      // 확장 멤버는 코드마다 달라 호출부가 필요한 키만 읽는다(예전 data 와 같은 취급).
      // biome-ignore lint/suspicious/noExplicitAny: 코드별 확장 멤버
      extra: Record<string, any>;
    };

const PROBLEM_MEMBERS = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
]);

export async function performanceRequest<T>(
  request: Promise<T>,
): Promise<PerformanceResult<T>> {
  try {
    return { ok: true, data: await request };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === null) throw error;
    const problem = error.problem;
    const extra = Object.fromEntries(
      Object.entries(problem ?? {}).filter(
        ([key]) => !PROBLEM_MEMBERS.has(key),
      ),
    );
    // 예전 코드 이름을 지킨다: 처리되지 않은 500 은 INTERNAL, problem 이 아닌 본문은 UNKNOWN(401 은 UNAUTHENTICATED).
    const code = problem
      ? problem.code === "INTERNAL_ERROR"
        ? "INTERNAL"
        : problem.code
      : error.status === 401
        ? "UNAUTHENTICATED"
        : "UNKNOWN";
    return {
      ok: false,
      status: error.status,
      code,
      message: problem ? problem.detail : null,
      extra,
    };
  }
}
