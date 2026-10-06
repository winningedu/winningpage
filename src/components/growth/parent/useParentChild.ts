import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ParentChildGate =
  | { status: "loading" }
  | { status: "not-linked" }
  | { status: "linked"; childName: string };

// 알림톡 링크로 바로 들어와도 동작하도록 회원유형과 연결 판정을 페이지 안에서 한다.
// fn_parent_children 은 호출자가 학부모일 때만 승인된 자녀를 돌려준다. 학부모가 아니거나
// 이 자녀가 목록에 없거나 조회가 실패하면 모두 not-linked 다. 진짜 방어선은 서버 재검증(403)이다.
export function useParentChild(childId: string | undefined): ParentChildGate {
  const [gate, setGate] = useState<ParentChildGate>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setGate({ status: "loading" });

    (async () => {
      const { data, error } = await supabase.rpc("fn_parent_children");
      if (!alive) return;
      if (error) {
        console.error("자녀 조회 실패:", error);
        setGate({ status: "not-linked" });
        return;
      }
      const found = (data ?? []).find(
        (row) =>
          row.student_profile_id === childId && row.link_status === "approved",
      );
      setGate(
        found
          ? { status: "linked", childName: found.student_name }
          : { status: "not-linked" },
      );
    })();

    return () => {
      alive = false;
    };
  }, [childId]);

  return gate;
}
