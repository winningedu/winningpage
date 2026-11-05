// W13 목록 조회. 쿼리 값이 있는 것만 순서대로 붙이고 page 를 마지막에 붙인다.
// 휴대폰은 쪽을 이어 붙이고(더 보기), 그 밖에는 page 한 쪽만 읽는다.

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { consoleRequest } from "../api";

export const HISTORY_KEY = ["console", "student-history"] as const;

export interface Paged<T> {
  total: number;
  page: number;
  pageCount: number;
  items: T[];
}

export function listUrl(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  return `${path}?${query}`;
}

async function fetchPage<P>(url: string): Promise<P> {
  const res = await consoleRequest(url);
  if (res.status !== 200) throw new Error(`${url} ${res.status}`);
  return res.body as P;
}

// X 는 목록과 함께 오는 덧붙은 값(졸업생의 years)이다.
export function usePagedList<T, X extends object = object>(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
  mobile: boolean,
) {
  const single = useQuery({
    queryKey: [...HISTORY_KEY, listUrl(path, params, page)],
    queryFn: () => fetchPage<Paged<T> & X>(listUrl(path, params, page)),
    retry: false,
    placeholderData: keepPreviousData,
    enabled: !mobile,
  });
  const more = useInfiniteQuery({
    queryKey: [...HISTORY_KEY, "more", listUrl(path, params, 1)],
    queryFn: ({ pageParam }) =>
      fetchPage<Paged<T> & X>(listUrl(path, params, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.pageCount ? last.page + 1 : undefined,
    retry: false,
    enabled: mobile,
  });
  const last = more.data?.pages.at(-1);
  const data: (Paged<T> & X) | undefined = mobile
    ? last && {
        ...last,
        items: more.data?.pages.flatMap((p) => p.items) ?? [],
      }
    : single.data;
  return {
    data,
    isError: mobile ? more.isError : single.isError,
    fetchMore: () => void more.fetchNextPage(),
  };
}
