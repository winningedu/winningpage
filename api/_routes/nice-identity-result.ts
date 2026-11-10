// POST /api/nice-identity-result  { requestId }
//
// 법정대리인 PASS 본인확인(D-1)이 끝난 뒤, 프론트가 새로고침·재방문으로 콜백의
// postMessage 결과를 놓쳤을 때 DB에서 다시 조회하는 보조 경로다(흐름 B — 흐름
// A는 콜백이 즉시 돌려주는 mobile, api/_routes/nice-identity-callback.ts 참고).
//
// requestId만으로 인증
//   가입 전 단계라 로그인 세션이 없다. request_id는 NICE 표준창에 실려 나갔다가
//   돌아오므로 URL에 노출되긴 하지만, generateRequestNo()(api/_lib/niceIdentity.ts)가
//   `WE` + 22자리 랜덤 hex로 발급해 추측이 불가능하다 — 그 전제 위에서 이 값 자체를
//   조회 권한으로 쓴다. 조회 조건도 status='verified' && purpose='under14_guardian' &&
//   consumed_at is null && verified_at이 30분 이내인 행으로 좁혀, 가입 RPC
//   (complete_signup_profile, supabase/migrations/20260821000000_baseline.sql)가
//   실제로 소비를 허용하는 창과 동일하게 맞춘다.
//
// mobile 외에는 절대 반환하지 않는다. ci/di/name/birth_date 등은 여기서 쓸 일이
// 없고, 이 라우트가 인증 세션 없이 열려 있는 이상 최소한만 내보내야 한다.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// generateRequestNo()는 'WE' + hex 22자 = 24자 고정이지만, 형식이 바뀌어도
// 깨지지 않게 넉넉히 잡는다(빈 값·비상식적으로 긴 값만 막는 목적).
const MAX_REQUEST_ID_LENGTH = 128;

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "본인확인 정보를 조회하는 중 오류가 발생했습니다.",
  logLabel: "nice-identity-result",
  handler: async (req, res, ctx) => {
    const requestId = String(req.body?.requestId || "").trim();

    if (!requestId || requestId.length > MAX_REQUEST_ID_LENGTH) {
      sendError(
        res,
        "okDetail",
        400,
        "요청 형식이 올바르지 않습니다.",
        undefined,
        { reason: "invalid_request" },
      );
      return;
    }

    const { data: row, error } = await ctx.supabaseAdmin
      .from("identity_verifications")
      .select("mobile")
      .eq("request_id", requestId)
      .eq("status", "verified")
      .eq("purpose", "under14_guardian")
      .is("consumed_at", null)
      .gt("verified_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .maybeSingle();

    if (error) throw error;

    if (!row) {
      sendError(
        res,
        "okDetail",
        404,
        "본인확인 정보를 찾을 수 없습니다.",
        undefined,
        { reason: "not_found" },
      );
      return;
    }

    res.status(200).json({
      ok: true,
      mobile: (row.mobile || "").replace(/[^0-9]/g, ""),
    });
  },
});
