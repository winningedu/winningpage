// POST /api/goal/admin/reset-student
// Authorization: Bearer <supabase access token>   (관리자 = is_winning_admin() 미러)
//
// 목표관리 어드민 전용 "소프트 리셋" — 학생을 온보딩 이전 상태로 되돌려
// 재접속 시 온보딩 폼(RequireGoalAccess.jsx 리다이렉트, 이미 구현돼 있음)으로
// 다시 보낸다. 온보딩 완료 후에는 재입력이 409로 완전 차단돼 있어(intake.js),
// 오입력 정정이나 정시 컷이 늦게 채워진 학생을 구제할 방법이 이것뿐이다.
//
// 이 라우트가 하는 일은 얇다 — 실제 리셋 로직(무엇을 지우고 무엇을 보존하는지)은
// 전부 RPC public.fn_goal_reset_student(uuid)에 있다(sql/81_goal_student_reset.sql).
// 여기서 재구현하지 않는다 — 단일 트랜잭션으로 원자적이어야 하기 때문이다.
//
// 어드민 판정은 resolveAdmin(is_admin, uid 단일)이 아니라 resolveWinningAdmin
// (is_winning_admin, uid∨email + role 4종)을 쓴다 — goal_students의 기존 RLS
// 정책(goal_students_admin_select)이 is_winning_admin()을 쓰므로 이 API도 같은
// 기준이어야 정합적이다(api/_lib/adminAuth.js 상단 주석). defineHandler의
// auth:"winningAdmin"이 이 resolveWinningAdmin을 그대로 호출한다(api/_lib/handler.ts).
//
// 응답 규격
//   200 { ok: true }              리셋 완료.
//   400 { detail }                profileId 누락.
//   401 { detail }                토큰 없음/무효.
//   403 { detail }                관리자 아님.
//   404 { detail }                해당 profileId 의 goal_students 행이 없음.
//   405 { detail }                POST 아님.
//   500 { detail }                RPC 실패, 서버 설정 누락 등.
//
// createSupabaseAdmin() 설정 오류(500) 문구는 defineHandler(api/_lib/handler.ts)
// 최상위 catch가 식별해 "서버 설정이 올바르지 않습니다."로 복원한다 — 라우트별
// unhandledMessage로 뭉개지던 문제는 batch-8에서 해소됐다.
//
// goal-admin 앱의 리셋 버튼 UI는 이번 범위 밖이다(PR #63, 이 브랜치엔 미포함) —
// 이 엔드포인트는 백엔드만 완성한다.

import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "winningAdmin",
  errorShape: "detail",
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/admin/reset-student",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;

    const { profileId } = req.body || {};
    if (!profileId || typeof profileId !== "string") {
      return void sendError(res, "detail", 400, "profileId가 필요합니다.");
    }

    const { error } = await supabaseAdmin.rpc("fn_goal_reset_student", {
      p_profile_id: profileId,
    });

    if (error) {
      if (String(error.message || "").includes("goal_student_not_found")) {
        return void sendError(
          res,
          "detail",
          404,
          "해당 학생을 찾을 수 없습니다.",
        );
      }
      console.error("goal/admin/reset-student RPC 오류:", error);
      return void sendError(res, "detail", 500, "리셋 처리에 실패했습니다.");
    }

    return void res.status(200).json({ ok: true });
  },
});
