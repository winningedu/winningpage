import { useEffect, useState } from "react";
import {
  SEARCH_DEBOUNCE_MS,
  type SearchOutcome,
  searchOutcome,
} from "./surveySearch";

/** 입력이 멈춘 뒤 300ms 에 검색한다. 이전 요청의 늦은 응답은 버린다. */
export function useSearchSuggestions(
  query: string,
  search: (term: string) => Promise<string[]>,
): { results: string[]; outcome: SearchOutcome } {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim() === "") {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      search(query).then((found) => {
        if (!alive) return;
        setResults(found);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  return { results, outcome: searchOutcome({ query, loading, results }) };
}
