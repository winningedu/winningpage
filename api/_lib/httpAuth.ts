// 일반 사용자(로그인 여부) 판정 — Bearer 토큰 → Supabase 유저.
//
// 기존 22곳(check-service-access.ts, diagnosis/*.ts, performance/*.ts 등)이
// 각자 인라인으로 `getBearerToken → auth.getUser → null 체크`를 복붙해 왔다.
// 이 함수가 그걸 한 곳으로 수렴한다. 401 응답 자체는 여기서 만들지 않는다 —
// 라우트마다 에러 바디 형태(ErrorShape)가 다르므로, 그 판단은 호출부
// (`defineHandler`)에 남긴다.

import type { User } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { getBearerToken } from "./serviceAccess.js";
import { createSupabaseAdmin } from "./supabaseAdmin.js";

export interface AuthedUser {
  userId: string;
  user: User;
  token: string;
}

/** Bearer 토큰 검증 → 유저. 실패 시 null. 401 응답은 defineHandler/호출부 책임. */
export async function resolveUser(
  req: Pick<VercelRequest, "headers">,
): Promise<AuthedUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return { userId: data.user.id, user: data.user, token };
}
