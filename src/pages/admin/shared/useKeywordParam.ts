import { useSearchParams } from "react-router";

// 목록 검색어를 주소의 q 에 둔다. 새로고침과 뒤로가기에서 살아야 하고, 입력마다 히스토리가 쌓이면 안 돼 replace 로 쓴다.
export function useKeywordParam(): [string, (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get("q") ?? "";
  function setKeyword(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("q", next);
        else params.delete("q");
        return params;
      },
      { replace: true },
    );
  }
  return [keyword, setKeyword];
}
