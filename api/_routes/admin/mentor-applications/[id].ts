// GET, PATCH /api/admin/mentor-applications/:id
//
// GET: 신청 한 건, 없으면 404 NOT_FOUND. PATCH: 상태만 바꾼다(옛 화면도 status 만 썼다). 닿은 행이 없으면 404.
// 권한: 메뉴 mentorApplications(GET view, PATCH edit).

import { z } from "zod";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "../../../../src/lib/mentor-application/status.js";
import { parseInput } from "../../../_lib/coupon/parseInput.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const STATUSES = MENTOR_APPLICATION_STATUS_OPTIONS.map(
  (option) => option.value,
);

const patchSchema = z.strictObject({
  status: z.string().refine((value) => STATUSES.includes(value)),
});

function sendNotFound(res: Parameters<typeof sendError>[0]) {
  sendError(res, "problem", 404, "멘토 신청을 찾을 수 없어요.", "NOT_FOUND");
}

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "mentorApplications" },
  unhandledMessage: "멘토 신청 내역을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications/id]",
  query: z.object({ id: z.uuid() }),
  handler: async (req, res, ctx) => {
    const { id } = ctx.query;

    if (req.method === "PATCH") {
      const body = parseInput(res, patchSchema, req.body);
      if (!body) return;
      const { data, error } = await ctx.supabaseAdmin
        .from("mentor_applications")
        .update({ status: body.status })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error("mentor application update failed");
      if (!data) {
        sendNotFound(res);
        return;
      }
      res.status(200).json(data);
      return;
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("mentor_applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("mentor application read failed");
    if (!data) {
      sendNotFound(res);
      return;
    }
    res.status(200).json(data);
  },
});
