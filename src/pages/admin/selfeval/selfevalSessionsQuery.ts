// 자기평가서 세션 목록 조회 상태, 필터(상태), 검색어(입력 중 draft / 적용된 q), 페이지.
export const SELFEVAL_SESSIONS_PAGE_SIZE = 20;

export type SelfevalSessionsQuery = {
  status: string;
  draft: string;
  q: string;
  page: number;
  pageSize: number;
};

export const initialSelfevalSessionsQuery: SelfevalSessionsQuery = {
  status: "",
  draft: "",
  q: "",
  page: 1,
  pageSize: SELFEVAL_SESSIONS_PAGE_SIZE,
};

export type SelfevalSessionsQueryAction =
  | { type: "setStatus"; status: string }
  | { type: "setDraft"; draft: string }
  | { type: "submit" }
  | { type: "setPage"; page: number };

export function selfevalSessionsQueryReducer(
  state: SelfevalSessionsQuery,
  action: SelfevalSessionsQueryAction,
): SelfevalSessionsQuery {
  switch (action.type) {
    case "setStatus":
      return { ...state, status: action.status, page: 1 };
    case "setDraft":
      return { ...state, draft: action.draft };
    case "submit":
      return { ...state, q: state.draft.trim(), page: 1 };
    case "setPage":
      return { ...state, page: Math.max(1, Math.floor(action.page)) };
  }
}

export function buildSelfevalSessionsSearch(
  state: SelfevalSessionsQuery,
): string {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.q) params.set("q", state.q);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return params.toString();
}
