// 심화탐구 TanStack Query 팩토리. queryClient.ts 의 관례를 따른다.
//   - queryKey 에 userId 를 반드시 넣는다(계정 전환 시 캐시 오염 방지).
//   - enabled: !!userId 를 팩토리에 둔다(게스트 상태에서 소비처가 실수로 조회하지 않게).
//   - 실패(error, timeout)는 성공 데이터로 캐싱하지 않고 InquiryApiError 로 던진다.
//     소비처는 query.error.result 로 code, status, extra 를 읽어 분기한다.
import { queryOptions } from "@tanstack/react-query";
import {
  type ApiResult,
  fetchReports,
  fetchSessionDetail,
  postSession,
} from "./api";

/** queryFn 이 던지는 에러. 원본 ApiResult(error 또는 timeout)를 그대로 들고 있다. */
export class InquiryApiError extends Error {
  readonly result: Exclude<ApiResult<unknown>, { kind: "ok" }>;

  constructor(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
    super(
      result.kind === "error"
        ? `inquiry-api-${result.code}`
        : "inquiry-timeout",
    );
    this.name = "InquiryApiError";
    this.result = result;
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (result.kind === "ok") return result.data;
  throw new InquiryApiError(result);
}

export const inquiryQueryKeys = {
  root: ["inquiry"] as const,
  /** 화면 1 부트스트랩(열린 세션 이어하기). */
  session: (userId: string | null) => ["inquiry", "session", userId] as const,
  reports: (userId: string | null) => ["inquiry", "reports", userId] as const,
  sessionDetail: (userId: string | null, sessionId: string | null) =>
    ["inquiry", "session-detail", userId, sessionId] as const,
};

// 생성, 저장 직후 갱신이 잦은 데이터라 짧게 둔다. 셸과 화면이 같은 캐시를 구독하므로
// 화면 이동마다 재조회하지 않을 만큼만 신선하게 둔다.
const INQUIRY_STALE_MS = 15_000;

/** 부트스트랩. 서버가 resume 으로 열린 세션, 잔여 회차, 후보 목록을 한 번에 준다. */
export function inquirySessionQuery(userId: string | null) {
  return queryOptions({
    queryKey: inquiryQueryKeys.session(userId),
    queryFn: async () => unwrap(await postSession({ action: "resume" })),
    staleTime: INQUIRY_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

export function inquiryReportsQuery(userId: string | null) {
  return queryOptions({
    queryKey: inquiryQueryKeys.reports(userId),
    queryFn: async () => unwrap(await fetchReports()),
    staleTime: INQUIRY_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

export function inquirySessionDetailQuery(
  userId: string | null,
  sessionId: string | null,
) {
  return queryOptions({
    queryKey: inquiryQueryKeys.sessionDetail(userId, sessionId),
    queryFn: async () => unwrap(await fetchSessionDetail(sessionId as string)),
    staleTime: INQUIRY_STALE_MS,
    enabled: !!userId && !!sessionId,
    retry: 0,
  });
}
