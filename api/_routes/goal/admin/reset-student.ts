// POST /api/goal/admin/reset-student
// Authorization: Bearer <supabase access token>   (관리자 + 메뉴 권한 goalStudents edit)
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
// 어드민 판정은 auth:"admin" + permission { key: "goalStudents" }(쓰기라 edit)이다. is_winning_admin 과
// is_admin 은 profiles_role_check 아래 같은 사용자를 고르므로 기준이 달라지지 않는다.
//
// 응답 규격(problem+json)
//   204                           리셋 완료(본문 없음).
//   400 VALIDATION_FAILED         profileId 누락 또는 uuid 아님.
//   401, 403                      토큰 없음, 관리자 아님, 메뉴 권한 부족(view).
//   404 NOT_FOUND                 해당 profileId 의 goal_students 행이 없음.
//   405                           POST 아님.
//   500                           RPC 실패, 서버 설정 누락 등.
//
// goal-admin 앱의 리셋 버튼 UI 는 GoalStudentsAdmin 이 이 엔드포인트를 부른다.

import { resetStudentBody } from "../../../../shared/goal/admin-students.js";
import { PROBLEM_CODE } from "../../../../shared/http/codes.js";
import { admin } from "../../../_lib/hono/admin.js";
import { adminFactory } from "../../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../../_lib/hono/problem.js";
import { validate } from "../../../_lib/hono/validate.js";

const guard = admin({
  permission: { key: "goalStudents" },
  // 기존 학생 기록을 되돌리는 리셋이라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/admin/reset-student",
});

export const resetStudent = adminFactory
  .createApp()
  .post("/", guard, validate("json", resetStudentBody), async (c) => {
    const { error } = await c.var.supabaseAdmin.rpc("fn_goal_reset_student", {
      p_profile_id: c.req.valid("json").profileId,
    });

    if (error) {
      if (String(error.message || "").includes("goal_student_not_found")) {
        throw new ProblemError(
          404,
          "해당 학생을 찾을 수 없습니다.",
          PROBLEM_CODE.NOT_FOUND,
        );
      }
      console.error("goal/admin/reset-student RPC 오류:", error);
      throw new ProblemError(500, "리셋 처리에 실패했습니다.", undefined);
    }

    return c.body(null, 204);
  })
  .all("/", methodNotAllowed("POST"));
