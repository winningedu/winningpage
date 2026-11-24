// GET /api/admin/inquiry-sessions/:id
// Authorization: Bearer <supabase access token>   (관리자)
//
// 세션 한 건. 목록 항목과 같은 모양(프로필 이름, 이메일, 선택 주제 제목 포함)이다.
// 응답 200 SessionListItem, 오류(problem): 400 VALIDATION_FAILED, 404 NOT_FOUND, 401/403 인증
// 권한: 메뉴 inquirySessions view.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import type { SessionListRow } from "../../../_lib/inquiry/ops/list.js";
import {
  SESSION_COLUMNS,
  toSessionItems,
} from "../../../_lib/inquiry/ops/sessionItems.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "inquirySessions" },
  methodNotAllowedMessage: "GET만 허용됩니다.",
  unhandledMessage: "심화탐구 세션 조회에 실패했습니다.",
  logLabel: "admin/inquiry-sessions/id",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ id: z.uuid() }),
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const { data, error } = await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", ctx.query.id)
      .maybeSingle();
    if (error) throw new Error(`inquiry_sessions 조회 실패: ${error.message}`);
    if (!data) {
      sendError(res, "problem", 404, "세션을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    const [item] = await toSessionItems(db, [data as SessionListRow]);
    res.status(200).json(item);
  },
});

export const config = { runtime: "nodejs" };
