import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { supabase } from "@/lib/supabase";

function decodeJwtPayload(token: string) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    // parts.length === 3 checked above, so parts[1] is guaranteed defined
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );

    return JSON.parse(json);
  } catch {
    return null;
  }
}

// 이름에 "OrSignOut"을 붙인 이유: 토큰 갱신 실패·만료 시 이 함수가 조회만 하지 않고
// supabase.auth.signOut()까지 호출한다(아래 두 분기). 호출부의 catch가 "에러 메시지만
// 보여주면 되는" 실패로 오인하지 않도록 이름에 그 부수효과를 그대로 드러낸다.
export async function getFreshSupabaseAccessTokenOrSignOut() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`관리자 로그인 세션 확인 실패: ${sessionError.message}`);
  }

  let session = sessionData?.session || null;

  if (!session?.access_token) {
    throw new Error(
      "관리자 로그인 세션이 없습니다. 로그아웃 후 다시 로그인하세요.",
    );
  }

  const payload = decodeJwtPayload(session.access_token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(session.expires_at || payload?.exp || 0);
  const shouldRefresh = !expiresAt || expiresAt - now < 300;

  if (shouldRefresh) {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError || !refreshData?.session?.access_token) {
      clearAllDrafts();
      await supabase.auth.signOut().catch(() => {});
      throw new Error(
        "관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.",
      );
    }

    session = refreshData.session;
  }

  const freshPayload = decodeJwtPayload(session.access_token);

  if (!freshPayload?.sub || !freshPayload?.exp) {
    throw new Error(
      "관리자 로그인 토큰 형식이 올바르지 않습니다. 다시 로그인한 뒤 저장하세요.",
    );
  }

  if (Number(freshPayload.exp) <= Math.floor(Date.now() / 1000)) {
    clearAllDrafts();
    await supabase.auth.signOut().catch(() => {});
    throw new Error(
      "관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.",
    );
  }

  return session.access_token;
}
