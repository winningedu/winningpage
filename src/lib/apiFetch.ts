// 클라이언트 fetch 공용 계층 — docs/client-auth-query-plan.md B-1.
//
// 이 파일 이전에는 세션 조회(getSession) → Bearer 헤더 조립 → fetch가 ~20곳에
// 인라인으로 흩어져 있었고, 그중 어디에도 타임아웃이 없었다. 네트워크가 한 번
// 멈추면 fetch가 응답도 실패도 없이 무한 대기하고, 그 위의 로딩 상태(가드
// "loading", 스켈레톤 등)도 함께 멈춰버렸다("뻑"). 여기서 타임아웃을 걸어
// 반드시 유한 시간 안에 실패로 정리되도록 한다 — 그래야 호출부가 재시도 UI로
// 넘어갈 수 있다.
//
// getAuthHeader()가 반환하는 모양(Authorization 헤더 객체 | null)과 세션 없음
// 판정(session.user + session.access_token 둘 다 있어야 유효)은 이 저장소가
// 이미 곳곳에서 쓰던 관례(예: goalApi.ts의 구 getAuthHeader)를 그대로 옮긴 것이다.
//
// getAuthHeader()는 apiFetch()가 자동으로 부르지 않는다 — 각 호출부(entitlement.ts,
// goalApi.ts 등)가 apiFetch() 호출 전에 직접 await한다. 그 덕에 인증 헤더 조회
// 시간이 apiFetch()의 타임아웃 예산을 갉아먹지 않는다(타이머는 apiFetch() 호출
// 시점에만 시작된다) — 리뷰에서 지적된 "타임아웃이 getAuthHeader() 대기 시간까지
// 포함한다" 문제는 자동 첨부 기능 자체를 없애 구조적으로 해소했다.

import { supabase } from "./supabase";
import { browserTimeZone, isValidTimeZone } from "./time/zone";

const DEFAULT_TIMEOUT_MS = 15000;

/** apiFetch가 타임아웃으로 요청을 중단했을 때만 던지는 에러 — 호출부가 이 타입으로
 * "재시도 가능한 실패"를 판별한다(그 외 네트워크 실패는 원래 fetch가 던지는 그대로 전파). */
export class ApiFetchTimeoutError extends Error {
  code = "TIMEOUT" as const;

  constructor(message = "요청이 시간 내에 끝나지 않았어요.") {
    super(message);
    this.name = "ApiFetchTimeoutError";
  }
}

/**
 * 현재 세션을 조회해 Authorization 헤더를 만든다.
 * 세션이 없으면 null을 반환한다 — 호출부는 이를 즉시 '세션 없음'으로 처리해야 한다.
 */
export async function getAuthHeader(): Promise<{
  Authorization: string;
} | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user || !session?.access_token) return null;

  return { Authorization: `Bearer ${session.access_token}` };
}

export interface ApiFetchOptions {
  /** 기본 15000ms. AI 호출처럼 서버 처리 시간이 긴 엔드포인트는 넉넉히 늘려 넘긴다. */
  timeoutMs?: number;
}

/**
 * 타임아웃이 있는 fetch. `AbortController` + `setTimeout`으로 직접 구현한다
 * (`AbortSignal.timeout()`/`AbortSignal.any()`는 iOS 15 Safari에 없어 그 사용자층에서
 * apiFetch 자체가 항상 예외를 던지는 회귀가 생긴다 — 리뷰 지적, 이 저장소가 iOS 15를
 * 지원 대상에서 제외한 적이 없다).
 *
 * 타임아웃 타이머는 `fetch()`가 성공/실패로 settle되는 즉시(`finally`) 정리한다 —
 * `AbortSignal.timeout()`은 타이머가 fetch 완료 후에도 계속 살아있어, 호출부가 응답을
 * 받은 뒤 `res.json()`을 파싱하는 도중에 타임아웃이 발화해 파싱 자체를 중단시킬 수
 * 있었다(리뷰 지적) — 이 함수가 반환하는 순간부터는 그 위험이 없다.
 *
 * 호출부가 이미 signal을 넘겼으면 리스너로 결합한다(`AbortSignal.any()`와 동일한
 * 효과, Safari 15 호환). 타임아웃으로 중단되면 ApiFetchTimeoutError를 던진다 —
 * 호출부의 외부 signal이 스스로 중단한 경우는 그대로 원래 에러를 전파한다.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  // 화면을 보는 사람의 시간대를 서버에 알린다. 호출부가 직접 정했으면 그 값을 쓴다.
  // 브라우저가 올바르지 않은 값을 주면 헤더를 생략한다(서버는 잘못된 값을 400 으로 막아
  // 사이트 전체가 멈추므로). 시간대가 꼭 필요한 라우트만 TIME_ZONE_REQUIRED 로 답한다.
  const headers = new Headers(init.headers);
  const zone = browserTimeZone();
  if (!headers.has("X-Time-Zone") && isValidTimeZone(zone))
    headers.set("X-Time-Zone", zone);

  try {
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new ApiFetchTimeoutError();
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
