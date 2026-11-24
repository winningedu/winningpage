// POST /api/admin/admission/results/bulk
//
// 입결정보 엑셀 업로드 한 청크(최대 500행)를 반영한다. id 없는 행은 insert, id 있는 행은 upsert.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 브라우저가 한 번에 보내는 상한(예전 RESULTS_APPLY_CHUNK).
const MAX_ITEMS = 500;

const body = z.object({
  items: z.array(z.record(z.string(), z.unknown())).max(MAX_ITEMS),
});

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보를 반영하지 못했습니다.",
  logLabel: "[admin/admission/results/bulk]",
  handler: async (req, res, ctx) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        "problem",
        400,
        `items 는 ${MAX_ITEMS}행 이하 배열이어야 합니다.`,
        "VALIDATION_FAILED",
      );
      return;
    }
    const { items } = parsed.data;
    const inserts = items.filter((item) => item.id === undefined);
    const updates = items.filter((item) => item.id !== undefined);

    // 아무것도 쓰기 전에 id 존재를 확인해, 없는 id 때문에 insert 만 반영되는 일을 막는다.
    if (updates.length > 0) {
      const ids = [...new Set(updates.map((item) => Number(item.id)))];
      const { data, error } = await ctx.supabaseAdmin
        .from("admission_results")
        .select("id")
        .in("id", ids);
      if (error) throw new Error("admission_results id read failed");
      const found = new Set((data ?? []).map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        sendError(
          res,
          "problem",
          404,
          `없는 id 가 있습니다: ${missing.join(", ")}`,
          "NOT_FOUND",
        );
        return;
      }
    }

    if (inserts.length > 0) {
      const { error } = await ctx.supabaseAdmin
        .from("admission_results")
        .insert(inserts);
      if (error) throw new Error("admission_results insert failed");
    }
    if (updates.length > 0) {
      const { error } = await ctx.supabaseAdmin
        .from("admission_results")
        .upsert(updates, { onConflict: "id" });
      if (error) throw new Error("admission_results upsert failed");
    }
    res.status(200).json({ inserted: inserts.length, updated: updates.length });
  },
});
