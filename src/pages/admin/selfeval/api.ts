// 자기평가서 세션 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.
// 학생 검색은 shared/studentSearch.ts 를 쓴다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type SelfevalGrantInput,
  selfevalGrantResultSchema,
  selfevalRecoverResultSchema,
} from "../../../../shared/selfeval-ops/contract.js";
import {
  type SelfevalSessionsPage,
  selfevalSessionDetail,
  selfevalSessionsPage,
} from "../../../../shared/selfeval-session/contract.js";
import {
  type SelfevalSessionsQuery,
  selfevalSessionsRequestParams,
} from "./query";

export const selfevalKeys = {
  all: ["admin", "selfeval-sessions"] as const,
  lists: () => [...selfevalKeys.all, "list"] as const,
  list: (query: SelfevalSessionsQuery) =>
    [...selfevalKeys.lists(), query] as const,
  detail: (id: string) => [...selfevalKeys.all, "detail", id] as const,
};

const one = (id: string) => `admin/selfeval-sessions/${encodeURIComponent(id)}`;

export function selfevalListQueryOptions(query: SelfevalSessionsQuery) {
  return queryOptions({
    queryKey: selfevalKeys.list(query),
    queryFn: ({ signal }) =>
      api
        .get("admin/selfeval-sessions", {
          searchParams: selfevalSessionsRequestParams(query),
          signal,
        })
        .json(selfevalSessionsPage),
  });
}

export function selfevalDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: selfevalKeys.detail(id),
    queryFn: ({ signal }) =>
      api.get(one(id), { signal }).json(selfevalSessionDetail),
  });
}

export function postSelfevalGrant(body: SelfevalGrantInput) {
  return api
    .post("admin/selfeval-grant", { json: body })
    .json(selfevalGrantResultSchema);
}

export function postSelfevalRecover(sessionId: string) {
  return api
    .post("admin/selfeval-recover", { json: { sessionId } })
    .json(selfevalRecoverResultSchema);
}
