// STEP5 평가·확정 호출 — docs/수행평가-상세-명세.md §8.6(엔드포인트 계약) / §9.3(차감) /
// §5.15·§5.16·§5.17.
//
// ── 계약 (`api/performance/evaluate.js` / `api/performance/finalize.js` 코드 실측이 정본)
//   요청  `POST /api/performance/evaluate` `{ sessionId, submissionId }`
//         **제출 원고를 보내지 않는다.** 서버가 `performance_submissions.fields`에서 읽는다 —
//         외부 앱은 클라이언트가 결합 텍스트와 `confirm_submit` 플래그를 보냈고
//         (`suhaengpyeong/api/evaluate-text.js:29-31`) 그 구조는 폐기됐다.
//   성공  `200 { report{id,sections,score,summary,structure,model,promptVersion}, submissionId,
//               submissionRevision, charCounts, quotaRemaining, charged:false, evaluationCount,
//               maxEvaluations }` (멱등 재생이면 `reused:true`)
//   실패  `400 EMPTY_SUBMISSION|REQUIRED_FIELD_EMPTY{field}|SUBMISSION_TOO_SHORT|SESSION_INCOMPLETE`
//         / `403 NO_ENTITLEMENT|NOT_SESSION_OWNER` / `404 SUBMISSION_NOT_IN_SESSION`
//         / `409 SESSION_NOT_CHARGED|REEVALUATION_LIMIT{limit}` / `429 EVALUATION_ATTEMPT_LIMIT`
//         / `502 MODEL_FAILED` / `500 INTERNAL` — **전부 무차감이다**(응답에도 `charged:false`).
//
//   요청  `POST /api/performance/finalize` `{ sessionId, submissionId, action }`
//   성공  `200 { submission{...}, finalReportId, reused, charged:false }`
//         `action:'new_assessment'`면 `{ nextSessionId, nextSessionCreated }` 추가.
//   실패  `400 NO_EVALUATION_YET|INVALID_ACTION` / `409 ALREADY_FINALIZED_OTHER{finalSubmissionId}`
//         / `403`·`404`는 evaluate와 동일 / `500 INTERNAL`.
//
// ── 회차 (§9.3) — 이 두 호출은 **차감 지점이 아니다**
//   §9.3 표 「제출 → 평가 리포트 생성 | 없음」, 「`추가 평가 받기` | 없음(상한 2회)」.
//   차감은 앱 전체에서 `recommend-topics` 최초 성공 1곳뿐이고(§9.3/Q84), 외부 앱의 4지점
//   선차감(`evaluate-text.js:51` 포함)은 이식하지 않았다. 그래서 이 화면은 평가·확정에서
//   차감을 예측하지도 표시하지도 않는다. `추가 수행평가 진행하기`가 만드는 **새 세션**도
//   무차감이며, 그 세션의 다음 주제 추천이 성공할 때 비로소 1회가 든다.
//
// ── 멱등
//   evaluate: 같은 `submissionId` 재요청은 **모델을 부르지 않고** 저장된 리포트를 그대로
//     돌려준다(`reused:true`). 그래서 응답만 유실된 경우의 재시도가 안전하다.
//   finalize: 같은 제출본 재확정은 `reused:true`로 같은 200이다(부분 UNIQUE + RPC 잠금).
//     **다른** 제출본이 이미 확정돼 있으면 `409 ALREADY_FINALIZED_OTHER`다.
//
// ── 왜 `designReport.js`의 에러 타입을 공유하지 않는가
//   실패 코드 집합과 화면이 분기에 쓰는 부가 필드가 다르다(`limit`/`field`/`finalSubmissionId`).
//   두 에러 타입이 같은 화면 상태 슬롯으로 흘러가므로 **`userMessage` 필드 이름만 맞춘다** —
//   `guideUpload.js`/`topics.js`/`designReport.js`가 이미 쓰는 규약이라 읽는 쪽이 출처를
//   따지지 않아도 된다.

import { entitlementDeniedMessage } from "../tenantBlock";
import { AI_CALL_TIMEOUT_MS, fetchWithTimeout } from "./apiClient";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/**
 * 서버가 문구를 주지 못한 경우(504로 본문이 비는 등)에만 쓰는 폴백.
 * 정상 경로에서는 **서버 문구를 그대로 쓴다** — 서버는 §8.6 공통 규약대로 원 예외·모델
 * 원문을 응답에 싣지 않으므로(`evaluate.js`/`finalize.js`의 `fail()`) 화면에 그대로 띄워도
 * 내부 정보가 새지 않는다.
 */
const EVALUATE_FALLBACK = {
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  SUBMISSION_NOT_IN_SESSION: "이 수행평가의 제출물이 아니에요.",
  SESSION_NOT_CHARGED: "주제 추천을 먼저 받아 주세요.",
  SESSION_INCOMPLETE: "설계 리포트를 먼저 받아 주세요.",
  EMPTY_SUBMISSION: "제출물을 작성해 주세요.",
  REQUIRED_FIELD_EMPTY: "필수 항목을 모두 작성해 주세요.",
  SUBMISSION_TOO_SHORT:
    "제출물이 너무 짧아요. 조금 더 작성한 뒤 다시 시도해 주세요.",
  REEVALUATION_LIMIT: "평가는 정해진 횟수까지만 다시 받을 수 있어요.",
  EVALUATION_ATTEMPT_LIMIT:
    "이 수행평가에서 평가를 너무 여러 번 요청했어요. 잠시 후 새 수행평가로 다시 시작해 주세요.",
  MODEL_FAILED: "평가 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const EVALUATE_GENERIC =
  "평가 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";

const FINALIZE_FALLBACK = {
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  SUBMISSION_NOT_IN_SESSION: "이 수행평가의 제출물이 아니에요.",
  NO_EVALUATION_YET: "평가 리포트를 먼저 받아 주세요.",
  ALREADY_FINALIZED_OTHER: "이미 다른 제출본을 최종본으로 확정했어요.",
};

const FINALIZE_GENERIC =
  "최종본을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 화면이 분기에 쓸 수 있는 형태로 실패를 감싼다. */
class EvaluationRequestError extends Error {
  code: string;
  userMessage: string;
  field: string | null;
  limit: number | null;
  evaluationCount: number | null;
  maxEvaluations: number | null;
  finalSubmissionId: string | null;

  constructor(
    code: string,
    message: string,
    extra: {
      field?: string | null;
      limit?: number | null;
      evaluationCount?: number | null;
      maxEvaluations?: number | null;
      finalSubmissionId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "EvaluationRequestError";
    this.code = code;
    this.userMessage = message;
    /** `REQUIRED_FIELD_EMPTY`에서만 실린다 — 어느 필드가 비었는지. */
    this.field = extra.field ?? null;
    /** `REEVALUATION_LIMIT` 안내용. */
    this.limit = extra.limit ?? null;
    this.evaluationCount = extra.evaluationCount ?? null;
    this.maxEvaluations = extra.maxEvaluations ?? null;
    /** `ALREADY_FINALIZED_OTHER`에서만 실린다 — 이미 확정된 제출본. */
    this.finalSubmissionId = extra.finalSubmissionId ?? null;
  }
}

/** 두 호출이 공유하는 fetch + 실패 변환. 성공 응답 본문을 그대로 돌려준다. */
async function postJson(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
  fallbackMap: Record<string, string>,
  genericMessage: string,
  timeoutMs?: number,
) {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
  } catch (error) {
    const wrapped = new EvaluationRequestError("NETWORK", NETWORK_ERROR);
    wrapped.cause = error;
    throw wrapped;
  }

  // 플랫폼이 함수를 죽이면(504 등) 본문이 비어 파싱이 실패한다 — 그때도 화면에는 무언가
  // 말해야 하므로 null로 받고 폴백으로 간다.
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const code = data?.error?.code || "UNKNOWN";
    throw new EvaluationRequestError(
      code,
      entitlementDeniedMessage(
        code,
        data?.error?.message || fallbackMap[code] || genericMessage,
        data?.tenantReason,
      ),
      {
        field: data?.field,
        limit: data?.limit,
        evaluationCount: data?.evaluationCount,
        maxEvaluations: data?.maxEvaluations,
        finalSubmissionId: data?.finalSubmissionId,
      },
    );
  }

  return data;
}

/**
 * 평가 리포트 1회. 같은 `submissionId`로 다시 부르면 모델을 부르지 않고 저장분을 돌려준다.
 *
 * @param {{accessToken: string, sessionId: string, submissionId: string}} params
 * @returns {Promise<object>} §8.6 성공 응답 전체.
 * @throws {EvaluationRequestError}
 */
export async function requestEvaluation({
  accessToken,
  sessionId,
  submissionId,
}: {
  accessToken: string;
  sessionId: string;
  submissionId: string;
}) {
  return postJson(
    "/api/performance/evaluate",
    { sessionId, submissionId },
    accessToken,
    EVALUATE_FALLBACK,
    EVALUATE_GENERIC,
    AI_CALL_TIMEOUT_MS,
  );
}

/**
 * 최종본 확정. §12.2 정본대로 `이대로 확정짓기`(`confirm`)와 `추가 수행평가 진행하기`
 * (`new_assessment`) **둘 다** 이 호출을 쓴다 — 차이는 `action` 값과, 서버가
 * `new_assessment`에서만 다음 세션(`nextSessionId`)을 준비한다는 것뿐이다.
 * `추가 평가 받기`는 이 호출을 쓰지 않는다(확정 없이 폼 복원).
 *
 * @param {{accessToken: string, sessionId: string, submissionId: string,
 *   action: 'confirm'|'new_assessment'}} params
 * @returns {Promise<object>} §8.6 성공 응답 전체.
 * @throws {EvaluationRequestError}
 */
export async function finalizeSubmission({
  accessToken,
  sessionId,
  submissionId,
  action,
}: {
  accessToken: string;
  sessionId: string;
  submissionId: string;
  action: "confirm" | "new_assessment";
}) {
  return postJson(
    "/api/performance/finalize",
    { sessionId, submissionId, action },
    accessToken,
    FINALIZE_FALLBACK,
    FINALIZE_GENERIC,
  );
}
