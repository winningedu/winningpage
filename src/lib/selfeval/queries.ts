// 자기평가서 TanStack Query 팩토리. 성장설계 queries.ts 와 같은 관례다.
//   - queryKey 에 userId 를 넣는다(계정 전환 시 캐시 오염 방지).
//   - enabled 는 팩토리가 쥔다(userId, sessionId 가 없으면 소비처가 실수로 조회하지 못하게).
//   - 실패는 성공 데이터로 캐싱하지 않고 SelfevalApiError 로 던진다. 소비처는 error.result 로 분기한다.
import { queryOptions } from "@tanstack/react-query";
import {
  type ApiResult,
  fetchEntry,
  fetchSessionDetail,
  pickList,
} from "./api";

export class SelfevalApiError extends Error {
  readonly result: Exclude<ApiResult<unknown>, { kind: "ok" }>;

  constructor(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
    super(
      result.kind === "error"
        ? `selfeval-api-${result.code}`
        : "selfeval-timeout",
    );
    this.name = "SelfevalApiError";
    this.result = result;
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (result.kind === "ok") return result.data;
  throw new SelfevalApiError(result);
}

export const selfevalQueryKeys = {
  root: ["selfeval"] as const,
  entry: (userId: string | null) => ["selfeval", "entry", userId] as const,
  session: (userId: string | null, sessionId: string | null) =>
    ["selfeval", "session", userId, sessionId] as const,
  pick: (userId: string | null, sessionId: string | null) =>
    ["selfeval", "pick", userId, sessionId] as const,
};

// 세션 생성, 선택 확정 직후 갱신이 잦아 짧게 둔다. 시작 화면과 사이드바가 같은 캐시를 읽는다.
const SELFEVAL_STALE_MS = 15_000;

export function selfevalEntryQuery(userId: string | null) {
  return queryOptions({
    queryKey: selfevalQueryKeys.entry(userId),
    queryFn: async () => unwrap(await fetchEntry()),
    staleTime: SELFEVAL_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

export function selfevalSessionQuery(
  userId: string | null,
  sessionId: string | null,
) {
  return queryOptions({
    queryKey: selfevalQueryKeys.session(userId, sessionId),
    queryFn: async () => unwrap(await fetchSessionDetail(sessionId as string)),
    staleTime: SELFEVAL_STALE_MS,
    enabled: !!userId && !!sessionId,
    retry: 0,
  });
}

export function selfevalPickQuery(
  userId: string | null,
  sessionId: string | null,
) {
  return queryOptions({
    queryKey: selfevalQueryKeys.pick(userId, sessionId),
    queryFn: async () => unwrap(await pickList(sessionId as string)),
    staleTime: SELFEVAL_STALE_MS,
    enabled: !!userId && !!sessionId,
    retry: 0,
  });
}
