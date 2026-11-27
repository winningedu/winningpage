// 저장 리포트(P12) 조회 호출 — docs/수행평가-상세-명세.md §5.18/§5.19/§8.6,
// `api/_routes/performance/reports.js` 코드 실측이 정본.
//
// ── 계약
//   목록  `GET /api/performance/reports?cursor=<updated_at ISO>&limit=<n>`
//         → 200 { items[{sessionId,topicTitle,gradeLabel,subjectGroup,subject,careerGoal,
//                 updatedAt,hasDesign,hasEvaluation,hasFinal,designReportId,
//                 evaluationReportId,finalReportId}], nextCursor|null }
//   상세  `GET /api/performance/reports?sessionId=<uuid>`
//         → 200 { session{...}, design|null, evaluation|null, final|null, submissions[] }
//         `design`/`evaluation`/`final`은 전부 `.sections` 배열을 최상위에 갖는 동일한
//         봉투 모양이라(서버가 정규화) `SectionedReportView`에 그대로 넘길 수 있다.
//   실패  401 UNAUTHENTICATED / 403 NO_ENTITLEMENT / 403 NOT_SESSION_OWNER(상세)
//         / 400 INVALID_SESSION_ID|INVALID_CURSOR / 405 METHOD_NOT_ALLOWED / 500 INTERNAL
//         — `design-report.js`/`submission.js`와 같은 `userMessage` 규약으로 감싼다.

import {
  reportDetailResponse,
  reportsListResponse,
} from "../../../shared/performance/contract.js";
import { api } from "../http/client";
import { type PerformanceResult, performanceRequest } from "./apiClient";

const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

const FALLBACK_MESSAGE = {
  UNAUTHENTICATED: "로그인이 필요합니다.",
  NO_ENTITLEMENT: "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
  NOT_SESSION_OWNER: "세션을 찾을 수 없어요.",
  INVALID_SESSION_ID: "잘못된 세션이에요.",
  INVALID_CURSOR: "목록을 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.",
};

const GENERIC_MESSAGE =
  "저장 리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

class ReportsError extends Error {
  code: string;
  userMessage: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReportsError";
    this.code = code;
    this.userMessage = message;
  }
}

function toError(failure: Extract<PerformanceResult<unknown>, { ok: false }>) {
  const { code } = failure;
  return new ReportsError(
    code,
    failure.message || FALLBACK_MESSAGE[code] || GENERIC_MESSAGE,
  );
}

async function callReportsApi<T>(
  accessToken: string,
  params: URLSearchParams,
  schema: typeof reportsListResponse | typeof reportDetailResponse,
): Promise<T> {
  let result: PerformanceResult<T>;

  try {
    result = await performanceRequest(
      api
        .get("performance/reports", {
          searchParams: params,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .json(schema) as Promise<T>,
    );
  } catch (error) {
    const wrapped = new ReportsError("NETWORK", NETWORK_ERROR);
    wrapped.cause = error;
    throw wrapped;
  }

  if (!result.ok) throw toError(result);
  return result.data;
}

/**
 * 저장 리포트 목록 1페이지.
 * @param {{accessToken: string, cursor?: string|null, limit?: number}} params
 * @returns {Promise<{items: object[], nextCursor: string|null}>}
 * @throws {ReportsError}
 */
export async function fetchSavedReportsList({
  accessToken,
  cursor = null,
  limit,
}: {
  accessToken: string;
  cursor?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  return callReportsApi<{ items: unknown[]; nextCursor: string | null }>(
    accessToken,
    params,
    reportsListResponse,
  );
}

/**
 * 저장 리포트 상세(세션 1건 + 설계/평가/최종 리포트 + 제출본 전체).
 * @param {{accessToken: string, sessionId: string}} params
 * @returns {Promise<{session: object, design: object|null, evaluation: object|null, final: object|null, submissions: object[]}>}
 * @throws {ReportsError}
 */
export async function fetchSavedReportDetail({
  accessToken,
  sessionId,
}: {
  accessToken: string;
  sessionId: string;
}) {
  const params = new URLSearchParams({ sessionId });
  return callReportsApi<{
    session: unknown;
    design: unknown;
    evaluation: unknown;
    final: unknown;
    submissions: unknown[];
  }>(accessToken, params, reportDetailResponse);
}
