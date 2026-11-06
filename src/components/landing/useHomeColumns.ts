import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ColumnRow } from "@/pages/column/columnData";
import {
  type HomeColumnBox,
  pickHomeColumns,
  toHomeColumnBox,
} from "./homeColumns";

/**
 * 홈 칼럼 박스 조회. columnData.fetchActiveColumns는 실패를 빈 배열로 삼켜 '글 없음'과 구분되지 않으므로,
 * 홈은 영역별 오류 안내(W1 error)를 위해 같은 조회를 직접 하고 status를 돌려준다.
 */
export function useHomeColumns({ enabled = true }: { enabled?: boolean } = {}) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    boxes: HomeColumnBox[];
  }>({ status: "loading", boxes: [] });

  useEffect(() => {
    if (!enabled) return undefined;

    let mounted = true;

    async function fetchColumns() {
      const { data, error } = await supabase
        .from("galleries")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("홈 칼럼 조회 오류:", error);
        setState({ status: "error", boxes: [] });
        return;
      }

      setState({
        status: "ready",
        boxes: pickHomeColumns((data || []) as ColumnRow[]).map(
          toHomeColumnBox,
        ),
      });
    }

    fetchColumns();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return state;
}
