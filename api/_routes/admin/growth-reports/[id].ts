// GET /api/admin/growth-reports/:id
// Authorization: Bearer <supabase access token>   (관리자)
//
// 회차 한 건. 목록 항목과 같은 모양(프로필 이름과 이메일 포함)이다.
// 응답 200 ReportListItem, 오류(problem): 400 VALIDATION_FAILED, 404 NOT_FOUND, 401/403 인증
// 권한: 메뉴 growthReports view.

import { z } from "zod";
import type { ReportListRow } from "../../../_lib/growth/ops/list.js";
import {
  REPORT_COLUMNS,
  toReportItems,
} from "../../../_lib/growth/ops/reportItems.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "growthReports" },
  methodNotAllowedMessage: "GET만 허용됩니다.",
  unhandledMessage: "성장설계 회차 조회에 실패했습니다.",
  logLabel: "admin/growth-reports/id",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ id: z.uuid() }),
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const { data, error } = await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("id", ctx.query.id)
      .maybeSingle();
    if (error) throw new Error(`growth_reports 조회 실패: ${error.message}`);
    if (!data) {
      sendError(res, "problem", 404, "회차를 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    const [item] = await toReportItems(db, [data as ReportListRow]);
    res.status(200).json(item);
  },
});

export const config = { runtime: "nodejs" };
