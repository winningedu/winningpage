// GET /api/session-check
// Authorization: Bearer <access_token>
//
// 동시 로그인 정책(prod: 계정당 1세션, Supabase "single session per user" 토글 +
// JWT expiry 300s — 그 설정 자체는 코드 밖, 이 라우트의 범위가 아니다) 하에서,
// 킥당한 탭이 "내가 지금도 유효한 세션인지"를 물어보는 엔드포인트다. 판정은 조회뿐이고,
// 유효한 세션이면 부수적으로 profiles.last_seen_at(최근 접속)을 30분에 한 번 적는다
// (결정 105). 이 기록은 실패해도 응답을 바꾸지 않고, 폐기된 세션에서는 적지 않는다.
// 탭 focus 시(refetchOnWindowFocus) 클라이언트가 이 라우트를 부른다 — 폴링·
// Realtime 없음(src/lib/queryClient.ts sessionCheckQueryOptions 참고).
//
// 판정 정밀 구분이 이 라우트의 전부다: 서버가 실제로 그 세션을 강제 종료한
// 경우(GoTrue의 session_not_found)만 "킥"으로 단정할 수 있다. 그 외(토큰 자체가
// 없음, 이미 만료됨, 서명 불일치 등)는 "그냥 로그아웃 상태"와 구분이 안 되므로
// 여기서 킥이라 우기면 안 된다 — 오탐 방지가 이 라우트의 유일한 존재 이유다.
//
// 응답 규격(errorShape: "coded")
//   200 { ok: true }
//   401 { error: { code: "SESSION_REVOKED", message } }   — 서버가 이 세션을
//                                                            명시적으로 폐기함.
//                                                            클라이언트는 이
//                                                            코드만 보고 킥
//                                                            확정 → signOut →
//                                                            메인 이동 →
//                                                            안내 다이얼로그.
//   401 { error: { code: "UNAUTHENTICATED", message } }   — 그 외 전부(토큰
//                                                            없음/만료/무효).
//                                                            클라이언트는 조용히
//                                                            무시한다(오탐 금지).
//
// auth:"none" + 수동 검증인 이유: defineHandler의 auth:"user"는 실패 사유를
// 구분하지 않고 항상 UNAUTHENTICATED 401 하나로 뭉갠다(_lib/handler.ts
// AUTH_REQUIRED_CODE) — 이 라우트는 그 사유(session_not_found 여부) 자체가
// 응답의 전부이므로 resolveUser를 쓸 수 없고, getUser 호출을 직접 해서 에러
// 객체를 들여다봐야 한다.

import {
  isAuthApiError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { getBearerToken } from "../_lib/serviceAccess.js";

export const config = { runtime: "nodejs" };

export const SESSION_REVOKED_CODE = "SESSION_REVOKED";
export const UNAUTHENTICATED_CODE = "UNAUTHENTICATED";
// 미처리 예외(500) 전용 — 401 두 코드(위)와 섞이면 클라이언트가 "인증 실패
// 계열"로 오분류할 수 있어 중립 코드로 분리한다.
const UNEXPECTED_CODE = "UNEXPECTED";
// 최근 접속 기록은 사용자당 이 간격에 한 번만 적는다(focus마다 불리는 라우트라서).
const LAST_SEEN_THROTTLE_MS = 30 * 60 * 1000;

/**
 * auth.getUser(jwt)가 던진(정확히는 { error }로 돌려준) 에러를 킥 판정 코드로
 * 분류한다.
 *
 * ⚠️ supabase-js(설치 버전 2.110.0 기준) auth-js의 handleError는 GoTrue REST가
 * 응답한 error_code "session_not_found"를 가로채 AuthApiError가 아니라
 * `AuthSessionMissingError`로 재포장해 던진다(auth-js dist/main/lib/fetch.js의
 * handleError, `errorCode === 'session_not_found'` 분기 — code/name 모두
 * AuthApiError와 다르고 isAuthApiError()도 false를 반환한다). 그래서
 * `isAuthSessionMissingError(error)`를 1차 판정으로 쓴다 — 이 라우트는 항상
 * `getUser(token)`처럼 jwt 인자를 직접 넘겨 호출하므로(토큰이 없으면 이 함수를
 * 부르기 전에 이미 401로 반환한다), AuthSessionMissingError가 나올 수 있는
 * 유일한 경로가 이 session_not_found 분기다 — jwt 없이 호출할 때만 타는 "세션
 * 자체가 없음" 분기(_getUser의 `_useSession` 경로)는 여기서 아예 발생하지
 * 않는다.
 *
 * `isAuthApiError(error) && error.code === "session_not_found"` 체크는 폴백으로
 * 남겨둔다 — 위 가로채기는 auth-js 내부 구현이라 버전에 따라 없을 수 있고,
 * 그런 버전에서는 원래 AuthApiError가 그대로 넘어온다.
 *
 * 이 두 갈래 중 어느 쪽에도 걸리지 않으면(만료·서명 불일치·네트워크 예외 등)
 * 전부 UNAUTHENTICATED로 뭉뚱그린다 — 킥 오탐을 만들 바에야 조용한 로그아웃
 * 쪽으로 기울인다(배정 메시지의 "그 외는 현행대로 조용히" 원칙).
 */
export function classifyAuthError(
  error: unknown,
): typeof SESSION_REVOKED_CODE | typeof UNAUTHENTICATED_CODE {
  if (isAuthSessionMissingError(error)) {
    return SESSION_REVOKED_CODE;
  }
  if (isAuthApiError(error) && error.code === "session_not_found") {
    return SESSION_REVOKED_CODE;
  }
  return UNAUTHENTICATED_CODE;
}

export default defineHandler({
  methods: ["GET"],
  auth: "none",
  errorShape: "coded",
  // 이 응답은 매 focus마다 최신 판정이어야 한다 — 프록시·브라우저 캐시가 이전
  // 200(또는 이전 401)을 재사용하면 킥 감지가 그 캐시 수명만큼 지연된다
  // (api/_routes/performance/evaluate.ts와 같은 관례).
  headers: { "Cache-Control": "no-store" },
  unhandledMessage: "세션 확인 중 오류가 발생했습니다.",
  unhandledCode: UNEXPECTED_CODE,
  logLabel: "session-check",
  handler: async (req, res, ctx) => {
    const token = getBearerToken(req);
    if (!token) {
      sendError(
        res,
        "coded",
        401,
        "로그인이 필요합니다.",
        UNAUTHENTICATED_CODE,
      );
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      const code = classifyAuthError(error);
      const message =
        code === SESSION_REVOKED_CODE
          ? "다른 기기에서 로그인되어 이 세션은 종료되었습니다."
          : "로그인이 필요합니다.";
      sendError(res, "coded", 401, message, code);
      return;
    }

    // 최근 접속 기록은 부가 기능이다. 실패해도 킥 판정 응답은 바꾸지 않는다.
    try {
      const now = Date.now();
      const { error: stampError } = await ctx.supabaseAdmin
        .from("profiles")
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq("id", data.user.id)
        .or(
          `last_seen_at.is.null,last_seen_at.lt.${new Date(now - LAST_SEEN_THROTTLE_MS).toISOString()}`,
        );
      if (stampError) {
        console.warn("session-check: last_seen_at 기록 실패", stampError);
      }
    } catch (stampThrown) {
      console.warn("session-check: last_seen_at 기록 예외", stampThrown);
    }

    res.status(200).json({ ok: true });
  },
});
