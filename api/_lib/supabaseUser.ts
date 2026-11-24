// 로그인한 사용자 본인 토큰으로 만드는 Supabase 클라이언트(publishable 키 + 사용자 JWT Bearer).
// RLS 와 auth.uid() 가 그 사용자로 적용된다. secret 키 클라이언트(supabaseAdmin.ts)와 달리 권한을 우회하지 않는다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types.js";
import { getEnv } from "./supabaseAdmin.js";

export function createSupabaseUserClient(
  token: string,
): SupabaseClient<Database> {
  return createClient<Database>(
    getEnv("WINNING_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL"),
    getEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}
