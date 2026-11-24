// GET /api/goal/admin/students/:id/records?limit
//
// 학생 한 명의 일별 기록. record_index 내림차순 앞에서 limit 건과 전체 건수.
// 화면의 "더보기"가 limit 을 늘려 앞에서부터 다시 받는다(구 화면 동작 그대로). 읽기 전용이다.

import { z } from "zod";
import { defineHandler } from "../../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

// 화면의 더보기 한 번이 30건씩 늘고, 상한은 남용 방지용이다.
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 1000;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalStudents" },
  query: z.object({
    id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  }),
  unhandledMessage: "학생 기록을 불러오지 못했습니다.",
  logLabel: "goal/admin/students/id/records",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { id, limit } = ctx.query;
    const { data, error, count } = await ctx.supabaseAdmin
      .from("goal_daily_records")
      .select("*", { count: "exact" })
      .eq("profile_id", id)
      .order("record_index", { ascending: false })
      .range(0, limit - 1);
    if (error) throw new Error("goal records failed");
    res.status(200).json({ items: data ?? [], total: count ?? 0 });
  },
});
