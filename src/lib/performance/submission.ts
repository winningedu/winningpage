// STEP5 제출물 호출 — docs/수행평가-상세-명세.md §8.6(엔드포인트 계약) / §8.3 / §5.14 / §9.3.
//
// ── 계약 (`api/_routes/performance/submission.js` 코드 실측이 정본)
//   조회  `GET /api/performance/submission?sessionId=…`
//         → 200 `{ schema, submission|null, minChars, maxRevisions }`
//         `schema`는 **서버 소유**다(§8.3 — 외부 앱은 DOM `data-schema` 왕복이라 위조
//         가능했다). 8종 중 무엇인지, 필드가 몇 개인지를 화면이 판정하지 않는다.
//   저장  `PUT /api/performance/submission` `{ sessionId, fields:{[key]:value}, mode }`
//         `mode:'draft'`(중간 저장) / `'submit'`(제출)
//         → 200 `{ submissionId, revision, fields, charCounts, savedAt, isDraft, isFinal,
//                  submittedAt, mode, schema, charTotal, minChars, maxRevisions }`
//         **평문 결합 텍스트를 클라이언트가 조립해 보내지 않는다**(§8.6). 프롬프트에
//         들어갈 문자열은 서버 `buildSubmissionText`가 만든다.
//   실패  400 `EMPTY_SUBMISSION`/`UNKNOWN_FIELD`/`INVALID_*` · 401 `UNAUTHENTICATED`
//         · 403 `NO_ENTITLEMENT`/`NOT_SESSION_OWNER` · 409 `SESSION_FINALIZED`/
//         `REEVALUATION_LIMIT` · 413 `SUBMISSION_TOO_LARGE` · 500 `INTERNAL`
//         `mode:'submit'`에서만 400 `SUBMISSION_TOO_SHORT` / `REQUIRED_FIELD_EMPTY`
//         — **전부 무차감이다**(§9.3, 차감 지점은 `recommend-topics` 1곳뿐).
//
// ── `mode:'submit'`의 400 두 종은 "저장까지 실패"가 아니다
//   서버는 게이트를 **저장 이후**에 본다(`submission.js` 「mode:'submit'」 주석). 그래서
//   `SUBMISSION_TOO_SHORT`/`REQUIRED_FIELD_EMPTY` 응답에도 `submissionId`·`savedAt`·
//   `charCounts`가 함께 실려 온다 — 화면은 이 두 코드에서 **초안이 남았다고 말해야 하고**,
//   에러 객체가 그 값을 그대로 들고 갈 수 있게 `saved`에 담아 던진다.
//
// ── revision 충돌(다중 탭)
//   revision은 서버가 최신 행 상태로 유도한다(클라이언트 플래그 없음). 경합이 나면
//   409 `REEVALUATION_LIMIT`(상한 초과) 또는 409 `SESSION_FINALIZED`(다른 탭이 그 행을
//   제출·확정)로 갈린다. 둘 다 **작성 내용을 건드리지 않는다** — 화면은 문구만 띄우고 폼
//   값을 그대로 둔다(재시도하면 그때의 최신 상태 기준으로 다시 판정된다 — `SESSION_FINALIZED`
//   뒤 재시도는 새 revision을 연다).

// 글자 수 규칙은 **서버와 같은 모듈**을 읽는다. 사본을 만들면 "카운터는 통과인데 서버가
// 거절"이 생긴다(§8.3 「시안 카운터와 동일 계산식 공유」). `submission-chars.js`는 의존이
// 0인 잎 모듈이라 브라우저 번들에 들어가도 서버 코드를 끌고 오지 않는다 — 그 파일 상단
// 주석이 "import를 추가하지 마라"로 그 성질을 계약으로 못박고 있다.
import { apiFetch } from "../apiFetch";

export {
  checkFieldsMinLength,
  countFieldChars,
  SUBMISSION_MIN_CHARS,
} from "../../../api/_lib/performance/submission-chars.js";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 서버가 문구를 주지 못한 경우(504로 본문이 비는 등)에만 쓰는 폴백. */
const FALLBACK_MESSAGE = {
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요. 처음부터 다시 시작해 주세요.",
  UNAUTHENTICATED: "로그인이 필요합니다.",
  EMPTY_SUBMISSION: "저장할 작성 내용이 없습니다.",
  UNKNOWN_FIELD:
    "제출폼이 최신 상태가 아니에요. 새로고침한 뒤 다시 시도해 주세요.",
  SESSION_FINALIZED:
    "이미 제출했거나 확정한 제출본은 수정할 수 없어요. 다시 저장하면 새 제출본으로 저장됩니다.",
  REEVALUATION_LIMIT: "제출물을 다시 낼 수 있는 횟수를 모두 사용했어요.",
  SUBMISSION_TOO_LARGE: "작성 내용이 너무 깁니다.",
  SUBMISSION_TOO_SHORT: "제출물이 너무 짧습니다.",
  REQUIRED_FIELD_EMPTY: "필수 항목을 모두 작성해 주세요.",
};

const GENERIC_MESSAGE =
  "제출물을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 저장 응답에서 초안 잔여 상태만 뽑아낸 모양(`pickSaved`가 만든다). */
type SavedState = {
  submissionId: string;
  revision: unknown;
  charCounts: Record<string, unknown>;
  savedAt: unknown;
  isDraft: boolean;
  isFinal: boolean;
  submittedAt: unknown;
};

/**
 * 화면이 분기에 쓸 수 있는 형태로 실패를 감싼다.
 * `userMessage`는 서버가 준 한국어 문구를 그대로 쓴다 — 서버는 §8.6 공통 규약대로 원
 * 예외·모델 원문을 응답에 싣지 않으므로(`submission.js`의 `fail()`) 그대로 띄워도 된다.
 * 이름은 `topics.js`/`designReport.js`와 맞춘다(같은 화면 상태 슬롯으로 흘러간다).
 */
class SubmissionError extends Error {
  code: string;
  userMessage: string;
  saved: SavedState | null;
  missingRequired: string[] | null;
  field: unknown;
  total: unknown;
  threshold: unknown;

  constructor(
    code: string,
    message: string,
    extra: {
      saved?: SavedState | null;
      missingRequired?: string[] | null;
      field?: unknown;
      total?: unknown;
      threshold?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "SubmissionError";
    this.code = code;
    this.userMessage = message;
    /** `mode:'submit'` 게이트 실패에서만 실린다 — 초안은 저장된 상태다(위 주석). */
    this.saved = extra.saved ?? null;
    this.missingRequired = extra.missingRequired ?? null;
    this.field = extra.field ?? null;
    this.total = extra.total ?? null;
    this.threshold = extra.threshold ?? null;
  }
}

// data: response.json() 파싱 결과 — 성공/실패 응답이 같은 키를 부분적으로만 공유해 any로 둔다.
/** 저장 응답에서 초안 잔여 상태만 뽑는다(게이트 실패 응답도 같은 키를 갖는다). */
function pickSaved(data: any): SavedState | null {
  if (!data?.submissionId) return null;
  return {
    submissionId: data.submissionId,
    revision: data.revision ?? null,
    charCounts:
      data.charCounts && typeof data.charCounts === "object"
        ? data.charCounts
        : {},
    savedAt: data.savedAt ?? null,
    isDraft: data.isDraft === true,
    isFinal: data.isFinal === true,
    submittedAt: data.submittedAt ?? null,
  };
}

// data: response.json() 파싱 결과 — 에러 코드별로 부가 필드가 달라 any로 둔다.
function toError(data: any, response: Response | undefined) {
  const code =
    data?.error?.code ||
    (response?.status === 401 ? "UNAUTHENTICATED" : "UNKNOWN");
  return new SubmissionError(
    code,
    data?.error?.message || FALLBACK_MESSAGE[code] || GENERIC_MESSAGE,
    {
      saved: pickSaved(data),
      missingRequired: Array.isArray(data?.missingRequired)
        ? data.missingRequired
        : null,
      field: data?.field,
      total: data?.total,
      threshold: data?.threshold,
    },
  );
}

/**
 * STEP5 제출폼 렌더 재료 1회 조회.
 * @param {{accessToken: string, sessionId: string}} params
 * @returns {Promise<{schema: object, submission: object|null, minChars: number, maxRevisions: number}>}
 * @throws {SubmissionError}
 */
export async function fetchSubmissionForm({
  accessToken,
  sessionId,
}: {
  accessToken: string;
  sessionId: string;
}) {
  let response: Response;

  try {
    response = await apiFetch(
      `/api/performance/submission?sessionId=${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (error) {
    const wrapped = new SubmissionError("NETWORK", NETWORK_ERROR);
    wrapped.cause = error;
    throw wrapped;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw toError(data, response);

  return data;
}

/**
 * 중간 저장 / 제출 1회.
 *
 * @param {{accessToken: string, sessionId: string, fields: Record<string,string>,
 *   mode: 'draft'|'submit'}} params `fields`는 **스키마에 선언된 키만** 담아야 한다
 *   (서버가 나머지를 `400 UNKNOWN_FIELD`로 거절한다 — 조용히 버리면 학생이 쓴 내용이
 *   소리 없이 사라지기 때문이다).
 * @returns {Promise<object>} 저장 응답 전체.
 * @throws {SubmissionError}
 */
export async function saveSubmission({
  accessToken,
  sessionId,
  fields,
  mode,
}: {
  accessToken: string;
  sessionId: string;
  fields: Record<string, string>;
  mode: "draft" | "submit";
}) {
  let response: Response;

  try {
    response = await apiFetch("/api/performance/submission", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sessionId, fields, mode }),
    });
  } catch (error) {
    const wrapped = new SubmissionError("NETWORK", NETWORK_ERROR);
    wrapped.cause = error;
    throw wrapped;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw toError(data, response);

  return data;
}
