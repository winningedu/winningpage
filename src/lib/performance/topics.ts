// STEP3 주제 추천 호출 — docs/수행평가-상세-명세.md §8.6(엔드포인트 계약) / §9.3(차감) / §5.20.
//
// ── 계약 (§8.6 엔드포인트 표)
//   요청  `POST /api/performance/recommend-topics` `{ sessionId, round? }`
//         **학년·과목·진로·안내문을 보내지 않는다.** 서버가 세션 행에서 읽는다 — 외부 앱은
//         클라이언트가 프롬프트 입력을 보내 조작이 가능했고(`api/recommend-topics.js:56-64`)
//         그 구조는 이식 대상이 아니다. 여기서 보낼 게 두 개뿐인 것이 계약의 요점이다.
//   성공  `200 { round, topics[3], quotaRemaining, charged, maxRounds, promptVersion, model, … }`
//   실패  `409 QUOTA_EXHAUSTED { quotaRemaining:0, planEndsAt }` / `409 ROUND_LIMIT { round, maxRounds }`
//         / `429 TOPIC_ATTEMPT_LIMIT { maxAttempts }` / `422 MODEL_CONTRACT_VIOLATION`
//         / `503 MODEL_UNAVAILABLE` / `403 NO_ENTITLEMENT` … **전부 무차감이다.**
//
// ── 회차 (§9.3) — 이 호출이 앱 전체에서 유일한 차감 지점이다
//   차감은 서버가 AI 응답 **성공 이후**에만 RPC로 커밋한다. 클라이언트는 차감을 요청하지도,
//   예측하지도 않는다 — `charged`/`quotaRemaining`은 결과 보고일 뿐이다.
//   재추천(`다른 주제 다시 추천`)은 같은 세션이라 RPC가 `already_charged`를 돌려주고
//   `charged:false`로 내려온다. **그것이 정상 경로다** — 실패로 읽지 말 것.
//
// ── 실패를 어떻게 넘기는가
//   화면은 실패 종류마다 다른 표면을 쓴다(소진은 §5.20 인라인 카드, 라운드 상한은 버튼
//   비활성 + 한 줄 안내, 나머지는 재시도 안내). 그래서 `guideUpload.js`처럼 문구 하나만
//   달아 던지면 부족하고 **`code`와 부가 필드까지** 실어 던진다 — 이것이 `guideUpload.js`의
//   `postJson`을 공유하지 않고 여기 따로 둔 이유다(그쪽은 `userMessage` 한 줄이면 끝난다).
//   `message`는 서버가 준 한국어 문구를 그대로 쓴다. 서버는 §8.6 공통 규약대로 원 예외·
//   모델 원문을 응답에 싣지 않으므로(`recommend-topics.js`의 `fail()`) 그대로 화면에 띄워도
//   내부 정보가 새지 않는다. 서버 문구가 없을 때만 아래 폴백을 쓴다.

import {
  entitlementDeniedMessage,
  parseTenantReason,
  type TenantBlockReason,
} from "../tenantBlock";
import { AI_CALL_TIMEOUT_MS, fetchWithTimeout } from "./apiClient";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 서버가 문구를 주지 못한 경우(504로 본문이 비는 등)에만 쓰는 폴백. */
const FALLBACK_MESSAGE = {
  QUOTA_EXHAUSTED: "이용 가능한 횟수를 모두 사용했어요.",
  ROUND_LIMIT: "주제 추천은 최대 3회까지 받을 수 있어요.",
  // 429 — 성공 라운드 상한(ROUND_LIMIT)과 **다른 축**이다. 실패로 끝난 모델 호출까지
  // 세는 세션당 시도 상한이라(sql/56) 재시도를 권하지 않는다.
  TOPIC_ATTEMPT_LIMIT:
    "주제 추천을 너무 여러 번 요청했어요. 새 수행평가로 다시 시작해 주세요.",
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  ENTITLEMENT_EXPIRED: "이용권 사용 기간이 끝났어요.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  SESSION_INCOMPLETE: "기본 정보를 먼저 입력해 주세요.",
  GUIDE_REQUIRED: "수행평가 안내문을 먼저 입력해 주세요.",
  MODEL_CONTRACT_VIOLATION: "주제를 정리하지 못했어요. 다시 시도해 주세요.",
  MODEL_UNAVAILABLE: "주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const GENERIC_MESSAGE = "주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 화면이 분기에 쓸 수 있는 형태로 실패를 감싼다.
 * `userMessage`는 `guideUpload.js`와 같은 이름을 쓴다 — 두 모듈의 에러가 같은 화면
 * 상태 슬롯으로 흘러 들어가므로 읽는 쪽이 출처를 따지지 않아도 되게 한다.
 */
class TopicRequestError extends Error {
  code: string;
  userMessage: string;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  round: number | null;
  maxRounds: number | null;
  /** 스쿨멘토 기관 거부 사유. 위닝 응답에는 없어 null 이다. */
  tenantReason: TenantBlockReason | null;

  constructor(
    code: string,
    message: string,
    extra: {
      quotaRemaining?: number | null;
      planEndsAt?: string | null;
      round?: number | null;
      maxRounds?: number | null;
      tenantReason?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "TopicRequestError";
    this.code = code;
    this.userMessage = message;
    this.quotaRemaining = extra.quotaRemaining ?? null;
    this.planEndsAt = extra.planEndsAt ?? null;
    this.round = extra.round ?? null;
    this.maxRounds = extra.maxRounds ?? null;
    this.tenantReason = parseTenantReason(extra.tenantReason);
  }
}

/**
 * 주제 추천 1회. **최초 추천과 재추천이 같은 엔드포인트다** — 다른 점은 `round`뿐이고,
 * 그마저 서버가 기존 라운드 수를 세어 스스로 정하므로 의도 확인용으로만 보낸다(§8.6 `round?`).
 *
 * @param {{accessToken: string, sessionId: string, round?: number}} params
 * @returns {Promise<{round: number, topics: object[], quotaRemaining: number|null, charged: boolean, maxRounds: number}>}
 * @throws {TopicRequestError}
 */
export async function recommendTopics({
  accessToken,
  sessionId,
  round,
}: {
  accessToken: string;
  sessionId: string;
  round?: number;
}) {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      "/api/performance/recommend-topics",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(round ? { sessionId, round } : { sessionId }),
      },
      AI_CALL_TIMEOUT_MS,
    );
  } catch (error) {
    const wrapped = new TopicRequestError("NETWORK", NETWORK_ERROR, {});
    wrapped.cause = error;
    throw wrapped;
  }

  // 플랫폼이 함수를 죽이면(504 등) 본문이 비어 파싱이 실패한다 — 그때도 화면에는 무언가
  // 말해야 하므로 null로 받고 폴백으로 간다.
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const code = data?.error?.code || "UNKNOWN";
    throw new TopicRequestError(
      code,
      entitlementDeniedMessage(
        code,
        data?.error?.message || FALLBACK_MESSAGE[code] || GENERIC_MESSAGE,
        data?.tenantReason,
      ),
      {
        quotaRemaining: data?.quotaRemaining,
        planEndsAt: data?.planEndsAt,
        round: data?.round,
        maxRounds: data?.maxRounds,
        tenantReason: data?.tenantReason,
      },
    );
  }

  return data;
}
