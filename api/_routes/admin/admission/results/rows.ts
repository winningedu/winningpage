// GET /api/admin/admission/results/rows?offset=N&fields=all|id
//
// 입결정보를 id 오름차순으로 1000행씩 읽는다(PostgREST 한 번에 돌려주는 상한). 엑셀 내려받기는
// fields=all(29컬럼), 업로드 미리보기는 fields=id 로 id 만 읽는다.

import { z } from "zod";
import { ADMISSION_RESULT_COLUMNS } from "../../../../_lib/admission/resultColumns.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const PAGE_SIZE = 1000;

const query = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  fields: z.enum(["all", "id"]),
});

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionResults" },
  query,
  unhandledMessage: "입결정보를 읽지 못했습니다.",
  logLabel: "[admin/admission/results/rows]",
  handler: async (_req, res, ctx) => {
    const { offset, fields } = ctx.query;
    const { data, error } = await ctx.supabaseAdmin
      .from("admission_results")
      .select(fields === "all" ? ADMISSION_RESULT_COLUMNS.join(",") : "id")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("admission_results read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
