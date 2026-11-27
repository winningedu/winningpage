// GET/POST/PUT/DELETE /api/goal/schedules
// Authorization: Bearer <access_token>
//
// 목표관리 "중요일정"(#41 목록 / #40 등록·수정 모달, 대시보드 ScheduleRail, 사이드바
// 카운트 뱃지가 공유) CRUD 엔드포인트. 컨벤션은 api/_routes/goal/intake.js · api/_routes/goal/student.js ·
// api/_routes/goal/daily-record.js 하우스 스타일을 그대로 따른다(openGoalSession, config.runtime,
// 405/401/403/500, 화이트리스트 우선 검증).
//
// sql/74_goal_schedules.sql 이 클라이언트 write 정책을 하나도 두지 않았으므로(RLS는
// select own + admin all만) 쓰기는 이 파일(service_role)이 유일한 경로다. 그래서
// update/delete는 반드시 profile_id를 같이 걸어 소유자 판정을 서버가 직접 강제한다
// (api/_lib/goal/repo.ts openGoalSession JSDoc 규약 1, updateSchedule/deleteSchedule 참고).
//
// 게이트 순서는 daily-record.js와 동일하다 — 조회(GET)는 미결제를 200 {allowed:false}로,
// 쓰기(POST/PUT/DELETE)는 403으로 알린다(§9-1). 온보딩 미완료(goal_students 행 없음)는
// 409 {reason:'not_onboarded'}다 — goal_schedules.profile_id가 goal_students(profile_id)를
// FK로 참조하므로, 이 게이트 없이 insert를 시도하면 23503(foreign_key_violation)이 그대로
// 500으로 새어나간다. 정상 경로에선 이 라우트가 RequireGoalAccess로 온보딩 완료가 보장된
// /app/goal/schedules에서만 호출되므로(App.jsx), 이 분기는 방어적 코드다 — daily-record.js와
// 달리 status==='active'까지는 요구하지 않는다(중요일정은 확률 계산과 무관하다).

import type { z } from "zod";
import {
  scheduleCreateBody,
  scheduleDeleteBody,
  type scheduleDeleteResponse,
  type scheduleResponse,
  type schedulesListResponse,
  scheduleUpdateBody,
} from "../../../shared/goal/schedules.js";
import { goalFail } from "../../_lib/goal/problem.js";
import {
  buildSchedulePayload,
  deleteSchedule,
  fetchSchedules,
  fetchStudentRow,
  insertSchedule,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  updateSchedule,
} from "../../_lib/goal/repo.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

// openGoalSession 반환 shape 을 그 함수에서 추론해 쓴다(중복 선언 없이 JSDoc 이 바뀌면 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

// 온보딩 게이트(쓰기 3종과 GET 공용, 위 파일 헤더 참고). 통과하면 undefined, 아니면 409 응답이다.
async function requireOnboardedStudent(
  // 호출부가 narrowGoalSession()으로 좁힌 값만 넘기므로 항상 존재한다.
  supabaseAdmin: NonNullable<GoalSession["supabaseAdmin"]>,
  profileId: NonNullable<GoalSession["profileId"]>,
) {
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  return row?.onboarded_at ? null : { reason: "not_onboarded" };
}

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/schedules",
});

const UNHANDLED = { detail: "처리 중 오류가 발생했습니다." };

export const schedules = userFactory
  .createApp()
  .get("/", guard, async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return c.json({
          allowed: false,
          ...tenantReasonExtra(session.tenantReason),
        } satisfies z.input<typeof schedulesListResponse>);
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
      if (gate) return goalFail(c, 409, gate);

      const rows = await fetchSchedules(supabaseAdmin, profileId);
      return c.json({
        schedules: rows.map(buildSchedulePayload),
      } as z.input<typeof schedulesListResponse>);
    } catch (error) {
      console.error("goal/schedules error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .post("/", guard, validate("json", scheduleCreateBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
      if (gate) return goalFail(c, 409, gate);

      const body = c.req.valid("json");
      const row = await insertSchedule(supabaseAdmin, {
        profile_id: profileId,
        title: body.title,
        category: body.category,
        due_date: body.dueDate,
        memo: body.memo,
      });
      return c.json({
        schedule: buildSchedulePayload(row),
      } as z.input<typeof scheduleResponse>);
    } catch (error) {
      console.error("goal/schedules error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .put("/", guard, validate("json", scheduleUpdateBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
      if (gate) return goalFail(c, 409, gate);

      const body = c.req.valid("json");
      const row = await updateSchedule(supabaseAdmin, profileId, body.id, {
        title: body.title,
        category: body.category,
        due_date: body.dueDate,
        memo: body.memo,
      });
      if (!row) {
        return goalFail(c, 404, { detail: "일정을 찾을 수 없습니다." });
      }

      return c.json({
        schedule: buildSchedulePayload(row),
      } as z.input<typeof scheduleResponse>);
    } catch (error) {
      console.error("goal/schedules error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .delete("/", guard, validate("json", scheduleDeleteBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
      if (gate) return goalFail(c, 409, gate);

      const deleted = await deleteSchedule(
        supabaseAdmin,
        profileId,
        c.req.valid("json").id,
      );
      if (!deleted) {
        return goalFail(c, 404, { detail: "일정을 찾을 수 없습니다." });
      }

      return c.json({} satisfies z.input<typeof scheduleDeleteResponse>);
    } catch (error) {
      console.error("goal/schedules error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .all("/", methodNotAllowed("GET", "POST", "PUT", "DELETE"));
