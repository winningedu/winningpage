// GET /api/console/enrollment-requests/count
//
// W13 배지 숫자. 범위 안의 열린 학적 변경 신청 수다. 담임은 자기 학급으로 오는 신청만,
// 학교 관리자와 본사 대행은 기관 전체를 센다. 숫자만 돌려주므로 감사 로그는 남기지 않는다.

import { scopeQuery } from "../../../_lib/console/scope.js";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

interface PendingCountQuery {
  eq(column: string, value: string): PendingCountQuery;
  in(column: string, values: string[]): PendingCountQuery;
  then: PromiseLike<{ count: number | null; error: unknown }>["then"];
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "신청 수를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/enrollment-requests/count]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    const { count, error } = await scopeQuery(
      ctx.supabaseAdmin
        .from("enrollment_changes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending") as unknown as PendingCountQuery,
      actor,
      { classColumn: "to_class_id" },
    );
    if (error || count === null) throw new Error("pending count failed");

    res.status(200).json({ count });
  },
});
