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

// 필터 칸을 주소에서 다시 채우는 key. page 는 빼서 쪽을 넘겨도 칸에 적던 값이 지워지지 않게 한다.
export function filterKey(params: URLSearchParams): string {
  const copy = new URLSearchParams(params);
  copy.delete("page");
  return copy.toString();
}
