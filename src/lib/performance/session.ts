// 재개 분기 판정표(§5.4) 재료 조회 — `api/_routes/performance/session.js` GET.
//
// ── 계약 (`api/_routes/performance/session.js` 코드 실측이 정본)
//   `GET /api/performance/session?sessionId=…`
//   → 200 { session, topics, round, maxRounds }
//   `session.selectedTopicId`/`topics.length`가 재개 분기 판정표(2370행)의 ⓐ/ⓑ/ⓒ를
//   가르는 재료다. `topics`는 최신 라운드 3건뿐이다.
//   실패  400 INVALID_SESSION_ID · 401 UNAUTHENTICATED · 403 NO_ENTITLEMENT/
//         NOT_SESSION_OWNER · 500 INTERNAL

import { apiFetch } from "../apiFetch";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 서버가 문구를 주지 못한 경우(504로 본문이 비는 등)에만 쓰는 폴백. */
const FALLBACK_MESSAGE = {
  UNAUTHENTICATED: "로그인이 필요합니다.",
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  INVALID_SESSION_ID: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
};

const GENERIC_MESSAGE =
  "이전 진행 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

class SessionDetailError extends Error {
  code: string;
  userMessage: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionDetailError";
    this.code = code;
    this.userMessage = message;
  }
}

/**
 * 재방문 세션 1건의 재개 분기 재료 조회.
 * @param {{accessToken: string, sessionId: string}} params
 * @returns {Promise<{session: object, topics: object[], round: number, maxRounds: number}>}
 * @throws {SessionDetailError}
 */
export async function fetchSessionDetail({
  accessToken,
  sessionId,
}: {
  accessToken: string;
  sessionId: string;
}): Promise<{
  session: unknown;
  topics: unknown[];
  round: number;
  maxRounds: number;
}> {
  let response: Response;

  try {
    response = await apiFetch(
      `/api/performance/session?sessionId=${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (error) {
    const wrapped = new SessionDetailError("NETWORK", NETWORK_ERROR);
    wrapped.cause = error;
    throw wrapped;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const code = data?.error?.code || "UNKNOWN";
    throw new SessionDetailError(
      code,
      data?.error?.message || FALLBACK_MESSAGE[code] || GENERIC_MESSAGE,
    );
  }

  return data;
}
