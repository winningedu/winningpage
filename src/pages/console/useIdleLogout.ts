// 콘솔 셸 전용 유휴 로그아웃(설계 P22). 클릭이나 키 입력 없이 30분이 지나면 로그아웃한다.
// 서버는 유휴를 알 수 없어 클라이언트 타이머로만 처리한다. 콘솔 셸에서만 마운트한다.
// 마지막 활동 시각은 localStorage 로 탭끼리 나눠, 다른 탭에서 작업 중이면 이 탭이 로그아웃하지 않는다.

import { useEffect } from "react";
import { useNavigate } from "react-router";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { supabase } from "@/lib/supabase";

export const IDLE_LOGOUT_MS = 30 * 60 * 1000;
export const IDLE_ACTIVITY_KEY = "console:last-activity";

const ACTIVITY_EVENTS = ["click", "keydown"] as const;

function readSharedActivity(): number {
  try {
    const value = Number(localStorage.getItem(IDLE_ACTIVITY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(at: number) {
  try {
    localStorage.setItem(IDLE_ACTIVITY_KEY, String(at));
  } catch {
    // 저장소를 쓸 수 없으면 이 탭의 시각만으로 판단한다.
  }
}

export function useIdleLogout() {
  const navigate = useNavigate();

  useEffect(() => {
    let timer = 0;
    let lastActivity = Date.now();

    // 이 탭과 다른 탭 중 가장 늦은 활동 시각 기준으로 남은 시간 뒤에 확인한다.
    const schedule = () => {
      window.clearTimeout(timer);
      const latest = Math.max(lastActivity, readSharedActivity());
      const remaining = IDLE_LOGOUT_MS - (Date.now() - latest);
      timer = window.setTimeout(check, Math.max(remaining, 0));
    };
    const check = () => {
      const latest = Math.max(lastActivity, readSharedActivity());
      if (Date.now() - latest < IDLE_LOGOUT_MS) {
        schedule();
        return;
      }
      // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
      clearAllDrafts();
      const toLogin = () => navigate("/login", { replace: true });
      void supabase.auth.signOut({ scope: "local" }).then(toLogin, toLogin);
    };
    const onActivity = () => {
      lastActivity = Date.now();
      writeSharedActivity(lastActivity);
      schedule();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === IDLE_ACTIVITY_KEY) schedule();
    };

    writeSharedActivity(lastActivity);
    schedule();
    for (const type of ACTIVITY_EVENTS) {
      document.addEventListener(type, onActivity);
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) {
        document.removeEventListener(type, onActivity);
      }
      window.removeEventListener("storage", onStorage);
    };
  }, [navigate]);
}
