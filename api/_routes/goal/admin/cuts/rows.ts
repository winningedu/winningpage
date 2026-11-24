// GET /api/goal/admin/cuts/rows?from=
//
// 엑셀 일괄 패널이 쓰는 컷 전량 읽기. id 오름차순으로 from 부터 1,000행씩 돌려주고, 브라우저가 next 가 null 일 때까지
// 이어 받는다(id 정렬 없이 range 만 반복하면 페이지 경계에서 행이 겹치거나 빠진다).
// 컬럼은 화면이 읽던 아홉 개뿐이다. 노출이 꺼진 행도 포함한다(옛 RLS 는 관리자에게 전부 보였다).

import { z } from "zod";
import {
  GOAL_CUTS_READ_CHUNK,
  GOAL_CUTS_TABLE,
} from "../../../../_lib/goal/cuts.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const COLUMNS =
  "id, cut_type, university_name, department_name, avg_cut, source, source_year, is_active, note";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷 목록을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/rows]",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ from: z.coerce.number().int().min(0).default(0) }),
  handler: async (_req, res, ctx) => {
    const { from } = ctx.query;
    const { data, error } = await ctx.supabaseAdmin
      .from(GOAL_CUTS_TABLE)
      .select(COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error("goal cuts rows read failed");
    const items = (data ?? []) as unknown[];
    res.status(200).json({
      items,
      next: items.length === GOAL_CUTS_READ_CHUNK ? from + items.length : null,
    });
  },
});
