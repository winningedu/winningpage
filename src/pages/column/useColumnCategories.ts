import { useEffect, useState } from "react";
import { fetchColumnCategories } from "./columnData";

// 칩 목록(전체 제외). 불러오는 동안과 조회 실패 시에는 빈 배열이라 전체만 보인다.
export function useColumnCategories(): string[] {
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchColumnCategories().then((labels) => {
      if (alive) setCategories(labels);
    });
    return () => {
      alive = false;
    };
  }, []);

  return categories;
}
