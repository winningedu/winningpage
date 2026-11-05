// 콘솔 셸 전용 유휴 로그아웃(설계 P22). 클릭이나 키 입력 없이 30분이 지나면 로그아웃한다.
// 서버는 유휴를 알 수 없어 클라이언트 타이머로만 처리한다. 콘솔 셸에서만 마운트한다.

import { useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";

export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = ["click", "keydown"] as const;

export function useIdleLogout() {
  const navigate = useNavigate();

  useEffect(() => {
    let timer = 0;
    const start = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void supabase.auth.signOut({ scope: "local" }).finally(() => {
          navigate("/login", { replace: true });
        });
      }, IDLE_LOGOUT_MS);
    };
    start();
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, start);
    return () => {
      window.clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) {
        document.removeEventListener(type, start);
      }
    };
  }, [navigate]);
}
