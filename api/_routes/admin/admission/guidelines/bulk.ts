// PUT /api/admin/admission/guidelines/bulk
//
// 대입모집요강 엑셀 업로드 결과(모든 행)를 (admission_year, university_key) 키로 한 번에 upsert 한다.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const body = z.object({ items: z.array(z.record(z.string(), z.unknown())) });

export default defineHandler({
  methods: ["PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionGuidelines" },
  unhandledMessage: "대입모집요강을 반영하지 못했습니다.",
  logLabel: "[admin/admission/guidelines/bulk]",
  handler: async (req, res, ctx) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        "problem",
        400,
        "items 는 행 배열이어야 합니다.",
        "VALIDATION_FAILED",
      );
      return;
    }
    const { items } = parsed.data;
    if (items.length > 0) {
      const { error } = await ctx.supabaseAdmin
        .from("admission_university_resources")
        .upsert(items, { onConflict: "admission_year,university_key" });
      if (error)
        throw new Error("admission_university_resources upsert failed");
    }
    res.status(200).json({ upserted: items.length });
  },
});
