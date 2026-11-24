// secret 키(SUPABASE_SECRET_KEY)로 만드는 Supabase 관리자 클라이언트.
//
// 기존 api/ 파일들이 각자 같은 코드를 들고 있었는데(create-order.js,
// confirm-payment.js, create-service-ticket.js), 신규 파일부터는 여기로 모은다.
// 기존 파일은 동작 중이라 이 커밋에서 건드리지 않는다.
//
// 이 클라이언트는 RLS를 통째로 우회한다. 그래서 이걸 쓰는 라우트는 "누가
// 무엇을 할 수 있는지"를 스스로 검사해야 한다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types.js";

// createSupabaseAdmin이 env 미설정 시 던지는 메시지. defineHandler(_lib/handler.ts)의
// 최상위 catch가 이 메시지로 "설정 오류"를 식별해 라우트별 unhandledMessage 대신
// 공통 "서버 설정이 올바르지 않습니다." 500을 낸다(dev 원본 ~20파일의 개별
// `try { createSupabaseAdmin() } catch { ... }` 패턴과 동일 문구를 재현).
export const SUPABASE_CONFIG_ERROR_MESSAGE =
  "WINNING_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.";

export function isSupabaseConfigError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SUPABASE_CONFIG_ERROR_MESSAGE
  );
}

export function getEnv(...keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

let cached: SupabaseClient<Database> | null = null;

export function createSupabaseAdmin() {
  if (cached) return cached;

  const url = getEnv(
    "WINNING_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  );
  const key = getEnv("SUPABASE_SECRET_KEY");

  if (!url || !key) {
    throw new Error(SUPABASE_CONFIG_ERROR_MESSAGE);
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
