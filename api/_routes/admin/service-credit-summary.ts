// GET /api/admin/service-credit-summary?profileId=
// Authorization: Bearer <supabase access token>   (관리자)
// 권한: 메뉴 serviceCreditAdjust(GET view).
//
// 고객 한 명의 6개 서비스(diagnose, target, growth, suhaeng, inquiry, selfeval) 이용횟수 현황.
// 이용권이 없는 서비스도 행은 나오며 총/사용/잔여는 0, 만료는 null 이다.
//
// 응답 200 { items: ServiceCreditRow[] }
// 오류(problem): 400 VALIDATION_FAILED(profileId 없음 또는 uuid 아님), 401/403 인증, 405 METHOD_NOT_ALLOWED, 500
//
// 조립은 api/_lib/service-credit/summary.ts.

import { z } from "zod";
import { defineHandler } from "../../_lib/handler.js";
import { readServiceCredits } from "../../_lib/service-credit/summary.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "serviceCreditAdjust" },
  unhandledMessage: "서비스 이용횟수 조회에 실패했습니다.",
  logLabel: "admin/service-credit-summary",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ profileId: z.uuid() }),
  handler: async (_req, res, ctx) => {
    res.status(200).json({
      items: await readServiceCredits(ctx.supabaseAdmin, ctx.query.profileId),
    });
  },
});

export const config = { runtime: "nodejs" };
