// /api/admin/mentor-applications 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/mentor-applications", mentorApplications) 로 붙인다.
// 하위 경로(/:id, /:id/proof-url)는 아직 라우터가 받는다.
//
// GET /api/admin/mentor-applications
//
// 멘토 신청 목록 { items }, 최신순. 이 화면은 읽기와 상태 변경만 한다(등록, 삭제 라우트 없음).
// 권한: 메뉴 mentorApplications(view). 응답 모양은 shared/mentor-applications/contract.ts 를 따른다.

import type { MentorApplicationList } from "../../../shared/mentor-applications/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";

const guard = admin({
  permission: { key: "mentorApplications" },
  unhandledMessage: "멘토 신청 내역을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications]",
});

export const mentorApplications = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("mentor_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("mentor applications read failed");
    return c.json({ items: data ?? [] } satisfies MentorApplicationList);
  })
  .all("/", methodNotAllowed("GET"));
