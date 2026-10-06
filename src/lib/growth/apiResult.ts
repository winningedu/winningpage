// 성장설계 API 응답 정규화(순수). 호출 계층(api.ts)이 fetch 결과를 이 함수에 넘겨
// discriminated union 하나로 돌려받는다. 이 저장소의 관례(goalApi.ts 헤더 주석)대로
// 실패도 예외가 아니라 반환값이고, 판별자는 서버 본문의 `ok`와 겹치지 않게 `kind`로 둔다.
//
//   { kind: "ok", data }                            2xx + 본문 ok:true
//   { kind: "error", status, code, message, extra? } 서버 실패 응답
//       coded 형식 본문 { error: { code, message }, ...extra } 를 기본으로 읽고,
//       최상위 { ok:false, code, message, ...extra } 도 허용한다.
//   { kind: "timeout" }                             타임아웃(재시도 가능한 실패). 호출 계층이 만든다.
//
// status 0은 서버에 닿지 못한 실패(네트워크, 세션 없음 등)에 쓴다. 호출 계층이 만든다.

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | {
      kind: "error";
      status: number;
      code: string;
      message: string;
      /** code, message, ok, error 를 뺀 나머지 본문 필드(attempts, issues, progress, terminal, open 등). */
      extra?: Record<string, unknown>;
    }
  | { kind: "timeout" };

export const GENERIC_ERROR_MESSAGE =
  "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * HTTP 상태와 파싱된 JSON 본문(파싱 실패는 null)을 ApiResult로 바꾼다.
 * 성공 판정은 상태코드와 본문 `ok === true`를 둘 다 요구한다, 둘 중 하나만 믿으면
 * 프록시가 돌려준 200 HTML 같은 비정상 응답이 성공 데이터로 새어 들어온다.
 */
export function normalizeApiResult<T>(
  status: number,
  body: unknown,
): ApiResult<T> {
  if (!isRecord(body)) {
    return {
      kind: "error",
      status,
      code: "INVALID_RESPONSE",
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (status >= 200 && status < 300) {
    if (body.ok === true) return { kind: "ok", data: body as T };
    return {
      kind: "error",
      status,
      code: "INVALID_RESPONSE",
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  const { ok: _ok, error, code: topCode, message: topMessage, ...rest } = body;
  const nested = isRecord(error) ? error : {};
  const code = nested.code ?? topCode;
  const message = nested.message ?? topMessage;
  const result: ApiResult<T> = {
    kind: "error",
    status,
    code: typeof code === "string" && code !== "" ? code : "UNKNOWN",
    message:
      typeof message === "string" && message !== ""
        ? message
        : GENERIC_ERROR_MESSAGE,
  };
  if (Object.keys(rest).length > 0) result.extra = rest;
  return result;
}
