import { useEffect, useState } from "react";
import { fetchResourceTitles } from "./api";

// 기대 자료 id 의 제목을 모아 불러온다. ids 문자열이 바뀔 때만 다시 부른다.
export default function useResourceTitles(
  ids: string[],
): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchResourceTitles(key.split(",")).then((result) => {
      if (!cancelled && result.ok) setTitles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return titles;
}
