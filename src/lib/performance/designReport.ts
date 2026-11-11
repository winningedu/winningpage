// STEP4 설계 리포트 호출 — docs/수행평가-상세-명세.md §8.6(엔드포인트 계약) / §9.3(차감) / §5.12.
//
// ── 계약 (`api/_routes/performance/design-report.js` 코드 실측이 정본)
//   요청  `POST /api/performance/design-report` `{ sessionId, topicId, regenerate? }`
//   성공  `200 { reportId, topicId, structure{type,reason,writingFrame}, sections[], resources[],
//               quotaRemaining, charged:false, generationCount, maxGenerations, promptVersion,
//               model, knowledge{} }` (멱등 재생이면 `reused:true` 추가)
//   실패  `403 NO_ENTITLEMENT` / `403 NOT_SESSION_OWNER` / `404 TOPIC_NOT_IN_SESSION`
//         / `409 TOPIC_ALREADY_CONFIRMED {reportId, confirmedTopicId}`
//         / `409 SESSION_NOT_CHARGED` / `400 SESSION_INCOMPLETE|GUIDE_REQUIRED`
//         / `429 RATE_LIMITED {limit, maxGenerations, generationCount, reportId}`
//         / `429 DESIGN_ATTEMPT_LIMIT` / `422 MODEL_CONTRACT_VIOLATION` / `503 MODEL_UNAVAILABLE`
//         / `500 INTERNAL` — **전부 무차감이다**(응답에도 `charged:false`가 실린다).
//
// ── 회차 (§9.3) — 이 호출은 **차감 지점이 아니다**
//   §9.3 표 「설계 리포트 생성·재생성 | 없음」. 서버는 `consume_performance_credit`을 아예
//   부르지 않고 `charged:false`를 고정으로 내린다. 화면은 차감을 예측하지도 표시하지도 않는다.
//
// ── 왜 `topics.js`의 `TopicRequestError`를 공유하지 않는가
//   실패 코드 집합이 다르고(주제 추천엔 `TOPIC_ALREADY_CONFIRMED`·`RATE_LIMITED`가 없다),
//   화면이 분기에 쓰는 부가 필드도 다르다(`confirmedTopicId`). 두 에러 타입이 같은 화면
//   상태 슬롯으로 흘러가므로 **`userMessage` 필드 이름만 맞춘다** — `guideUpload.js`/
//   `topics.js`가 이미 쓰는 규약이라 읽는 쪽이 출처를 따지지 않아도 된다.
//
// ── 멱등성: `regenerate`를 이 슬라이스는 보내지 않는다
//   같은 `topicId`로 다시 부르면 서버가 **모델을 부르지 않고** 저장된 리포트를 그대로
//   돌려준다(`reused:true`). 그래서 실패 후 재시도는 "혹시 커밋됐다면 그걸 복구하고,
//   아니면 새로 만든다"가 자동으로 성립한다. `regenerate:true`는 재생성 예산(2회)을 태우는
//   별개 행동이라 그 UI(§5.13에 없음)가 생길 때 함께 배선한다.

import { entitlementDeniedMessage } from "../tenantBlock";
import { AI_CALL_TIMEOUT_MS, fetchWithTimeout } from "./apiClient";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 서버가 문구를 주지 못한 경우(504로 본문이 비는 등)에만 쓰는 폴백. */
const FALLBACK_MESSAGE = {
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  TOPIC_NOT_IN_SESSION: "이 수행평가의 주제가 아니에요.",
  TOPIC_ALREADY_CONFIRMED: "이미 다른 주제로 확정한 수행평가예요.",
  SESSION_NOT_CHARGED: "주제 추천을 먼저 받아 주세요.",
  SESSION_INCOMPLETE: "기본 정보를 먼저 입력해 주세요.",
  GUIDE_REQUIRED: "수행평가 안내문을 먼저 입력해 주세요.",
  RATE_LIMITED: "설계 리포트는 정해진 횟수까지만 다시 만들 수 있어요.",
  DESIGN_ATTEMPT_LIMIT:
    "설계 리포트를 너무 여러 번 요청했어요. 잠시 후 다시 시도해 주세요.",
  MODEL_CONTRACT_VIOLATION:
    "설계 리포트를 정리하지 못했어요. 다시 시도해 주세요.",
  MODEL_UNAVAILABLE:
    "설계 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const GENERIC_MESSAGE =
  "설계 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 화면이 분기에 쓸 수 있는 형태로 실패를 감싼다.
 * `userMessage`는 서버가 준 한국어 문구를 그대로 쓴다 — 서버는 §8.6 공통 규약대로 원 예외·
 * 모델 원문을 응답에 싣지 않으므로(`design-report.js`의 `fail()`) 화면에 그대로 띄워도 된다.
 */
class DesignReportError extends Error {
  code: string;
  userMessage: string;
  confirmedTopicId: string | null;
  generationCount: number | null;
  maxGenerations: number | null;

  constructor(
    code: string,
    message: string,
    extra: {
      confirmedTopicId?: string | null;
      generationCount?: number | null;
      maxGenerations?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "DesignReportError";
    this.code = code;
    this.userMessage = message;
    // `TOPIC_ALREADY_CONFIRMED`에서만 실린다. 화면이 "이미 확정된 그 주제"로 안내를 바꾸는 데 쓴다.
    this.confirmedTopicId = extra.confirmedTopicId ?? null;
    this.generationCount = extra.generationCount ?? null;
    this.maxGenerations = extra.maxGenerations ?? null;
  }
}

/**
 * 주제 확정 + 설계 리포트 생성 1회. **두 일이 서버에서 한 트랜잭션이다**(§8.6 근거 —
 * 외부 앱의 2회 왕복 결함 회피). 그래서 클라이언트에 "확정만 하는" 호출은 없다.
 *
 * @param {{accessToken: string, sessionId: string, topicId: string, regenerate?: boolean}} params
 * @returns {Promise<object>} §8.6 성공 응답 전체.
 * @throws {DesignReportError}
 */
export async function requestDesignReport({
  accessToken,
  sessionId,
  topicId,
  regenerate = false,
}: {
  accessToken: string;
  sessionId: string;
  topicId: string;
  regenerate?: boolean;
}) {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      "/api/performance/design-report",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(
          regenerate
            ? { sessionId, topicId, regenerate: true }
            : { sessionId, topicId },
        ),
      },
      AI_CALL_TIMEOUT_MS,
    );
  } catch (error) {
    const wrapped = new DesignReportError("NETWORK", NETWORK_ERROR, {});
    wrapped.cause = error;
    throw wrapped;
  }

  // 플랫폼이 함수를 죽이면(504 등) 본문이 비어 파싱이 실패한다 — 그때도 화면에는 무언가
  // 말해야 하므로 null로 받고 폴백으로 간다.
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const code = data?.error?.code || "UNKNOWN";
    throw new DesignReportError(
      code,
      entitlementDeniedMessage(
        code,
        data?.error?.message || FALLBACK_MESSAGE[code] || GENERIC_MESSAGE,
        data?.tenantReason,
      ),
      {
        confirmedTopicId: data?.confirmedTopicId,
        generationCount: data?.generationCount,
        maxGenerations: data?.maxGenerations,
      },
    );
  }

  return data;
}
