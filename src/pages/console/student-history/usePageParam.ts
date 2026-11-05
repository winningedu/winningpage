// 쪽 번호를 쿼리스트링 page 에 둔다. 다른 값(tab, 필터)은 그대로 두고 page 만 바꾼다.

import { useSearchParams } from "react-router";

export function usePageParam(): [number, (page: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("page"));
  const page = Number.isInteger(raw) && raw >= 1 ? raw : 1;
  const setPage = (next: number) =>
    setParams((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set("page", String(next));
      return copy;
    });
  return [page, setPage];
}
