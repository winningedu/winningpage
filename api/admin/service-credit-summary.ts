// GET /api/admin/service-credit-summary?profileId=
// Authorization: Bearer <supabase access token>   (관리자)
//
// 고객 한 명의 6개 서비스(diagnose, target, growth, suhaeng, inquiry, selfeval) 이용횟수 현황.
// 이용권이 없는 서비스도 행은 나오며 총/사용/잔여는 0, 만료는 null 이다.
//
// 응답 200 { ok, items: ServiceCreditRow[] }
// 오류(coded): 400 INVALID_QUERY, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다. 조립은 api/_lib/service-credit/summary.ts.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { isUuid } from "../_lib/service-credit/adjust.js";
import { readServiceCredits } from "../_lib/service-credit/summary.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "서비스 이용횟수 조회에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/service-credit-summary",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const profileId = req.query.profileId;
    if (typeof profileId !== "string" || !isUuid(profileId)) {
      sendError(
        res,
        "coded",
        400,
        "profileId 가 올바르지 않습니다.",
        "INVALID_QUERY",
        {
          ok: false,
        },
      );
      return;
    }
    res.status(200).json({
      ok: true,
      items: await readServiceCredits(ctx.supabaseAdmin, profileId.trim()),
    });
  },
});

export const config = { runtime: "nodejs" };
