// 엔진 섹션 목록 쿼리의 단일 정의. Admin.tsx 와 라우트 미들웨어(선받기)가 같은 키로 만나도록 여기서만 만든다.
// 가볍게 유지한다: 미들웨어가 초기 번들에서 import 하므로 Admin.tsx, configs, React 컴포넌트를 끌어오지 않는다.

import { queryOptions } from "@tanstack/react-query";
import { ADMIN_SERVER_PAGINATE_SECTION_KEYS } from "../adminSectionKeys";
import { fetchSectionList, sectionKeys } from "./api";

/** 주소의 page(1 이상 정수, 아니면 1)와 q(없으면 빈 문자열). 필터와 미검토는 클라이언트 쪽이라 키에 넣지 않는다. */
export function parseListPageAndQ(params: URLSearchParams) {
  const page = Number(params.get("page"));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    q: params.get("q") ?? "",
  };
}

/** 서버 페이지 섹션만 page 와 q 가 키에 들어가고, 그 외 섹션은 page 와 q 를 무시하고 전량을 받는다. */
export function sectionListQueryOptions(
  key: string,
  list: { page: number; q: string },
) {
  const params = (
    ADMIN_SERVER_PAGINATE_SECTION_KEYS as readonly string[]
  ).includes(key)
    ? list
    : undefined;
  return queryOptions({
    queryKey: sectionKeys.list(key, params),
    queryFn: ({ signal }) => fetchSectionList(key, params, signal),
  });
}
