// GET /api/admin/mentor-applications
//
// 멘토 신청 목록 { items }, 최신순. 이 화면은 읽기와 상태 변경만 한다(등록, 삭제 라우트 없음).
// 권한: 메뉴 mentorApplications(view).

import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "mentorApplications" },
  unhandledMessage: "멘토 신청 내역을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications]",
  handler: async (_req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("mentor_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("mentor applications read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
