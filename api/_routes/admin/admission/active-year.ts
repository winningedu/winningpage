// GET, PUT /api/admin/admission/active-year
//
// 입시 공개 연도(app_settings.admission_active_year)를 읽고 쓴다. 예전에는 브라우저가
// app_settings 를 직접 읽고 upsert 했다. 값이 없을 때 상수로 채우지 않고 404 로 알린다.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const SETTING_KEY = "admission_active_year";
const YEAR_INVALID_MESSAGE = "연도는 2000~2100 사이 정수로 입력해 주세요.";

const putBody = z.object({ year: z.number().int().min(2000).max(2100) });

export default defineHandler({
  methods: ["GET", "PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionGuidelines" },
  unhandledMessage: "공개 연도를 처리하지 못했습니다.",
  logLabel: "[admin/admission/active-year]",
  handler: async (req, res, ctx) => {
    if (req.method === "GET") {
      const { data, error } = await ctx.supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      if (error) throw new Error("app_settings read failed");
      const year = data?.value;
      if (typeof year !== "number" || !Number.isInteger(year) || year <= 0) {
        sendError(
          res,
          "problem",
          404,
          "공개 연도가 아직 지정되지 않았습니다.",
          "NOT_FOUND",
        );
        return;
      }
      res.status(200).json({ year });
      return;
    }

    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "problem", 400, YEAR_INVALID_MESSAGE, "VALIDATION_FAILED");
      return;
    }
    const { year } = parsed.data;
    const { error } = await ctx.supabaseAdmin.from("app_settings").upsert(
      {
        key: SETTING_KEY,
        value: year,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error("app_settings upsert failed");
    res.status(200).json({ year });
  },
});
