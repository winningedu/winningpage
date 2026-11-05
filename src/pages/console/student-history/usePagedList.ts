// W13 목록 조회. 쿼리 값이 있는 것만 순서대로 붙이고 page 를 마지막에 붙인다.

import { useQuery } from "@tanstack/react-query";
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

export function usePagedList<T>(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const url = listUrl(path, params, page);
  return useQuery({
    queryKey: [...HISTORY_KEY, url],
    queryFn: async () => {
      const res = await consoleRequest(url);
      if (res.status !== 200) throw new Error(`${path} ${res.status}`);
      return res.body as Paged<T>;
    },
    retry: false,
  });
}
