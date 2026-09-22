import { useEffect, useState } from "react";
import { getAppSettingBool } from "@/lib/appSettings";
import { supabase } from "@/lib/supabase";

/**
 * app_settings.signup_enabled 게이트(WC074) — 가입 CTA 노출 여부.
 *
 * 반환값이 null인 동안(조회 전/로딩 중)에는 호출부가 CTA를 렌더하지 않아야 한다
 * — 게이트가 false인데 잠깐 CTA가 보였다 사라지는 번쩍임을 막기 위함이다(폴백
 * 상수로 true를 가정하지 않는다). 실제 가입 차단은 requireSignupEnabledMiddleware
 * (routeMiddleware.ts)가 라우트 단에서 이미 강제하므로, 이 훅은 CTA 노출만
 * 책임진다.
 *
 * 컴포넌트당 1회만 조회한다(마운트 시 한 번, deps 없음) — Header/MobileNavDrawer
 * 처럼 렌더 빈도가 높은 곳에서도 재조회가 반복되지 않는다.
 */
export function useSignupEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    getAppSettingBool(supabase, "signup_enabled").then((value) => {
      if (alive) setEnabled(value);
    });

    return () => {
      alive = false;
    };
  }, []);

  return enabled;
}
