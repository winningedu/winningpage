// 자기평가서 세션 목록 조회 조건. 상태, 검색어, 페이지는 주소(search params)에 둬서
// 새로고침과 뒤로가기에서 그대로 남는다. 입력 중인 검색어(draft)는 화면 state 다.
import { SELFEVAL_STATUS_OPTIONS } from "./row";

const SELFEVAL_SESSIONS_PAGE_SIZE = 20;

export type SelfevalSessionsQuery = {
  status: string;
  q: string;
  page: number;
  pageSize: number;
};

export function parseSelfevalSessionsQuery(
  params: URLSearchParams,
): SelfevalSessionsQuery {
  const status = params.get("status") ?? "";
  const page = Number(params.get("page"));
  return {
    status: (SELFEVAL_STATUS_OPTIONS as readonly string[]).includes(status)
      ? status
      : "",
    q: (params.get("q") ?? "").trim(),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: SELFEVAL_SESSIONS_PAGE_SIZE,
  };
}

// 기본값(전체, 검색어 없음, 1페이지)은 주소에서 뺀다. 상태나 검색어가 바뀌면 1페이지로 돌린다.
export function patchSelfevalSessionsParams(
  prev: URLSearchParams,
  patch: { status?: string; q?: string; page?: number },
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const put = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) next.delete(key);
    else next.set(key, value);
  };
  if (patch.status !== undefined) {
    put("status", patch.status, patch.status === "");
    next.delete("page");
  }
  if (patch.q !== undefined) {
    put("q", patch.q, patch.q === "");
    next.delete("page");
  }
  if (patch.page !== undefined) {
    const page = Math.max(1, Math.floor(patch.page));
    put("page", String(page), page === 1);
  }
  return next;
}

export function selfevalSessionsRequestParams(
  state: SelfevalSessionsQuery,
): Record<string, string> {
  return {
    ...(state.status ? { status: state.status } : {}),
    ...(state.q ? { q: state.q } : {}),
    page: String(state.page),
    pageSize: String(state.pageSize),
  };
}
