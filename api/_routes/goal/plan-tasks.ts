// GET|POST|PUT|DELETE /api/goal/plan-tasks
// Authorization: Bearer <access_token>
//
// 목표관리 학습 계획(주간 계획표 WeeklyPlan.jsx + 대시보드 "오늘 학습 계획" 레일
// StudyPlanRail.jsx)이 공유하는 과제 CRUD. 스키마는 sql/75_goal_plan_tasks.sql.
//
// 이 파일 하나가 4개 메서드를 전부 받는다 — student.js/intake.js처럼 메서드당
// 파일을 쪼개면 GET(조회)과 POST/PUT/DELETE(쓰기)가 게이트 문구만 다를 뿐
// openGoalSession 호출·소유자 스코프 로직이 그대로 중복되고, 클라이언트도
// 엔드포인트 하나를 CRUD 네 동사로 부르는 편이 REST 관행에 더 가깝다.
//
// ── 미결제 처리가 메서드마다 다른 이유 ──────────────────────────────────────
// GET은 조회형이라 200 {allowed:false}(§ api/_routes/goal/student.js 관례), 나머지
// 셋은 쓰기형이라 403 PAID_MESSAGE(§ api/_routes/goal/intake.js 관례)다. 조회형을
// 403으로 주면 entitlement.js가 그걸 "판정 불가(null)"로 접어 가드가
// 오작동한다 — 두 파일에 이미 있는 규약을 그대로 따른다.
//
// ── "일정(오늘만/이번 주만/매주 반복)" 은 이 API 계약에 없다 ────────────────
// AddTaskModal의 스케줄 셀렉트는 반복 규칙이 아니라 "몇 개의 plan_date에
// 각각 1행씩 만들지"를 결정하는 클라이언트 판단이다(sql/75 헤더 주석,
// src/lib/goalPlanUtils.js). 이 라우트는 단건 CRUD만 알고, 여러 날짜에
// 걸친 반복 생성은 클라이언트가 POST를 날짜 수만큼 반복 호출해서 만든다.

import type { z } from "zod";
import {
  PLAN_TASK_MAX_RANGE_DAYS,
  planTaskCreateBody,
  planTaskDeleteBody,
  type planTaskDeleteResponse,
  type planTaskResponse,
  type planTasksListResponse,
  planTasksQuery,
  planTaskUpdateBody,
} from "../../../shared/goal/plan-tasks.js";
import { goalFail } from "../../_lib/goal/problem.js";
import {
  buildPlanTaskPayload,
  computeWorkbookStatus,
  deletePlanTask,
  fetchPlanTasks,
  fetchWorkbookOwned,
  insertPlanTask,
  narrowGoalSession,
  nextWorkbookPageAfterTaskDone,
  num,
  openGoalSession,
  PAID_MESSAGE,
  SUBJECT_LABEL_TO_CODE,
  updatePlanTask,
  updateWorkbookOwned,
} from "../../_lib/goal/repo.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

type WorkbookLinkPatch = {
  workbook_id: number | null;
  page_from: number | null;
  page_to: number | null;
};

type WorkbookLinkFields = Pick<
  z.output<typeof planTaskUpdateBody>,
  "workbookId" | "pageFrom" | "pageTo"
>;

type RuleFailure = { status: number; body: { detail: string } };

// 도메인 규칙 실패(상태와 문구를 그대로 지킨다).
function fail(status: number, detail: string): RuleFailure {
  return { status, body: { detail } };
}

/**
 * body의 workbookId/pageFrom/pageTo(QA 행286-B, 계획↔문제집 연결) 셋의 조합 규칙을 본다.
 * 각 필드의 타입과 범위는 zod 계약이 이미 막았다. 소유자와 total_pages 확인은 DB 조회가
 * 필요해 verifyWorkbookLink 가 한다.
 *
 * 세 필드가 전부 없으면 { value: undefined }(이번 요청에서 손대지 않음). workbookId:
 * null이면 연결 해제(페이지도 함께 비운다), pageFrom/pageTo가 같이 오면 모순이라 거부한다.
 * workbookId가 있으면 pageFrom, pageTo는 "둘 다 없음"(페이지 없이 연결만) 또는
 * "둘 다 있고 pageFrom<=pageTo"만 허용한다.
 */
export function validateWorkbookLinkFields(body: WorkbookLinkFields): {
  error?: RuleFailure;
  value?: WorkbookLinkPatch;
} {
  const { workbookId, pageFrom, pageTo } = body;
  const hasPageFrom = pageFrom !== undefined;
  const hasPageTo = pageTo !== undefined;

  if (workbookId === undefined && !hasPageFrom && !hasPageTo) {
    return {};
  }

  if (workbookId === null) {
    if (hasPageFrom || hasPageTo) {
      return {
        error: fail(
          400,
          "문제집 연결을 해제할 때는 페이지 범위를 함께 보낼 수 없습니다.",
        ),
      };
    }
    return { value: { workbook_id: null, page_from: null, page_to: null } };
  }

  if (workbookId === undefined) {
    return {
      error: fail(400, "페이지 범위는 문제집을 선택해야 입력할 수 있습니다."),
    };
  }

  if (!hasPageFrom && !hasPageTo) {
    return {
      value: { workbook_id: workbookId, page_from: null, page_to: null },
    };
  }
  if (pageFrom === undefined || pageTo === undefined) {
    return {
      error: fail(400, "페이지 범위는 시작과 끝을 함께 입력해야 합니다."),
    };
  }
  if (pageFrom > pageTo) {
    return { error: fail(400, "시작 페이지는 끝 페이지보다 클 수 없습니다.") };
  }

  return {
    value: { workbook_id: workbookId, page_from: pageFrom, page_to: pageTo },
  };
}

/**
 * 문제집 연결 과제는 완전히 단일 날짜(선택한 그 날) 1건만 만들 수 있다(임무 지시
 * 정정, 2026-09-02). "이번 주만"의 7일 복제도 포함해서 막는다. 페이지 범위는
 * 그 문제집의 그 구간을 가리키는데, 같은 구간을 여러 날짜에 복제하면 "완료" 체크가
 * 여러 번 눌려도 진도는 max()로 한 번만 반영돼(nextWorkbookPageAfterTaskDone) 나머지
 * 요일 체크가 눈속임이 된다.
 *
 * repeatSchedule는 클라이언트가 "이번 주만"/"매주 반복"처럼 여러 plan_date로
 * 펼쳐 POST할 때만 실어 보내는 자기신고 신호다. AddTaskModal이 이 조합을 못 고르게
 * 막지만, API를 직접 두드리는 우회를 막는 방어선을 한 겹 더 둔다.
 */
export function validateRepeatScheduleWithWorkbook(
  body: { repeatSchedule?: boolean | undefined },
  link: WorkbookLinkPatch | undefined,
): RuleFailure | null {
  if (body.repeatSchedule === true && link?.workbook_id != null) {
    return fail(
      400,
      "문제집 연결 과제는 선택한 날짜 하루에만 추가할 수 있습니다.",
    );
  }
  return null;
}

/**
 * validateWorkbookLinkFields가 돌려준 값을 실제로 DB에 대고 확인한다: workbook_id가
 * 있으면 같은 profile 소유인지(fetchWorkbookOwned가 소유자 스코프까지 겸함),
 * page_to가 있으면 그 문제집의 total_pages를 넘지 않는지. null(연결 해제)이거나
 * undefined(손대지 않음)면 DB에 물어볼 게 없어 통과시킨다.
 */
async function verifyWorkbookLink(
  supabaseAdmin: ReturnType<typeof narrowGoalSession>["supabaseAdmin"],
  profileId: string,
  link: WorkbookLinkPatch | undefined,
) {
  if (!link || link.workbook_id == null) return null;

  const workbook = await fetchWorkbookOwned(
    supabaseAdmin,
    link.workbook_id,
    profileId,
  );
  if (!workbook) return fail(400, "문제집을 찾을 수 없습니다.");

  const totalPages = num(workbook.total_pages) ?? 0;
  if (link.page_to != null && link.page_to > totalPages) {
    return fail(
      400,
      `끝 페이지는 전체 페이지(${totalPages})를 넘을 수 없습니다.`,
    );
  }

  return null;
}

const NOT_FOUND = { detail: "과제를 찾을 수 없습니다." };
const UNHANDLED = { detail: "처리 중 오류가 발생했습니다." };

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/plan-tasks",
});

export const planTasks = userFactory
  .createApp()
  .get("/", guard, validate("query", planTasksQuery), async (c) => {
    try {
      const session = await openGoalSession(c);

      // 조회형 규약: 미결제는 에러가 아니다(§ student.js).
      if (!session.allowed) {
        return c.json({
          allowed: false,
          ...tenantReasonExtra(session.tenantReason),
        } satisfies z.input<typeof planTasksListResponse>);
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const { from, to } = c.req.valid("query");
      if (from > to) {
        return goalFail(c, 400, {
          detail: "from은 to보다 이전이어야 합니다.",
        });
      }
      const rangeDays =
        (new Date(`${to}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) /
        86400000;
      if (rangeDays > PLAN_TASK_MAX_RANGE_DAYS) {
        return goalFail(c, 400, {
          detail: `조회 기간은 최대 ${PLAN_TASK_MAX_RANGE_DAYS}일까지 가능합니다.`,
        });
      }

      const rows = await fetchPlanTasks(supabaseAdmin, profileId, from, to);
      return c.json({
        tasks: rows.map(buildPlanTaskPayload),
      } as z.input<typeof planTasksListResponse>);
    } catch (error) {
      console.error("goal/plan-tasks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .post("/", guard, validate("json", planTaskCreateBody), async (c) => {
    try {
      const session = await openGoalSession(c);
      if (!session.allowed)
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const body = c.req.valid("json");

      const link = validateWorkbookLinkFields(body);
      if (link.error) return goalFail(c, link.error.status, link.error.body);

      const repeatScheduleError = validateRepeatScheduleWithWorkbook(
        body,
        link.value,
      );
      if (repeatScheduleError)
        return goalFail(
          c,
          repeatScheduleError.status,
          repeatScheduleError.body,
        );

      const linkError = await verifyWorkbookLink(
        supabaseAdmin,
        profileId,
        link.value,
      );
      if (linkError) return goalFail(c, linkError.status, linkError.body);

      const row = await insertPlanTask(supabaseAdmin, {
        profile_id: profileId,
        plan_date: body.planDate,
        title: body.title,
        subject: SUBJECT_LABEL_TO_CODE[body.subject],
        duration_minutes: body.durationMinutes ?? 0,
        ...(link.value
          ? {
              workbook_id: link.value.workbook_id,
              page_from: link.value.page_from,
              page_to: link.value.page_to,
            }
          : {}),
      });

      return c.json({
        task: buildPlanTaskPayload(row),
      } as z.input<typeof planTaskResponse>);
    } catch (error) {
      console.error("goal/plan-tasks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .put("/", guard, validate("json", planTaskUpdateBody), async (c) => {
    try {
      const session = await openGoalSession(c);
      if (!session.allowed)
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const body = c.req.valid("json");

      // 부분 수정: 요청에 실려온 필드만 반영한다.
      const patch: {
        title?: string;
        subject?: string;
        duration_minutes?: number;
        plan_date?: string;
        status?: "pending" | "done" | "fail";
        done?: boolean;
        workbook_id?: number | null;
        page_from?: number | null;
        page_to?: number | null;
      } = {};

      if (body.title !== undefined) patch.title = body.title;
      if (body.subject !== undefined) {
        const code = SUBJECT_LABEL_TO_CODE[body.subject];
        if (code) patch.subject = code;
      }
      if (body.durationMinutes !== undefined)
        patch.duration_minutes = body.durationMinutes;
      if (body.planDate !== undefined) patch.plan_date = body.planDate;

      // status가 단일 원본(QA 행305): done은 status에서 파생해 항상 함께 갱신한다.
      // 다음 status 계산은 클라이언트(StudyPlanRail.tsx nextPlanTaskStatus)가 하고
      // 이 라우트는 유효한 3값인지만 본다.
      if (body.status !== undefined) {
        patch.status = body.status;
        patch.done = body.status === "done";
      }

      const link = validateWorkbookLinkFields(body);
      if (link.error) return goalFail(c, link.error.status, link.error.body);

      const linkError = await verifyWorkbookLink(
        supabaseAdmin,
        profileId,
        link.value,
      );
      if (linkError) return goalFail(c, linkError.status, linkError.body);

      if (link.value) {
        patch.workbook_id = link.value.workbook_id;
        patch.page_from = link.value.page_from;
        patch.page_to = link.value.page_to;
      }

      if (Object.keys(patch).length === 0) {
        return goalFail(c, 400, { detail: "수정할 필드가 없습니다." });
      }

      const row = await updatePlanTask(
        supabaseAdmin,
        profileId,
        body.id,
        patch,
      );
      if (!row) return goalFail(c, 404, NOT_FOUND);

      // 문제집 진도 전진(QA 행286-B): 이번 PUT이 status를 done으로 "전환"했고(과거
      // 상태와 무관하게 이번 요청이 done을 보냈을 때만), 갱신된 행에 workbook_id, page_to가
      // 함께 있으면 그 문제집의 current_page를 max(기존, page_to)로 전진시킨다(상한
      // total_pages). done에서 pending으로 되돌릴 때는 진도를 되감지 않는다(롤백 없음).
      if (
        patch.status === "done" &&
        row.workbook_id != null &&
        row.page_to != null
      ) {
        const workbook = await fetchWorkbookOwned(
          supabaseAdmin,
          row.workbook_id,
          profileId,
        );
        if (workbook) {
          const totalPages = num(workbook.total_pages) ?? 0;
          const currentPage = num(workbook.current_page) ?? 0;
          const nextCurrentPage = nextWorkbookPageAfterTaskDone(
            currentPage,
            num(row.page_to) ?? 0,
            totalPages,
          );
          if (nextCurrentPage !== currentPage) {
            await updateWorkbookOwned(
              supabaseAdmin,
              row.workbook_id,
              profileId,
              {
                current_page: nextCurrentPage,
                status: computeWorkbookStatus(nextCurrentPage, totalPages),
              },
            );
          }
        }
      }

      return c.json({
        task: buildPlanTaskPayload(row),
      } as z.input<typeof planTaskResponse>);
    } catch (error) {
      console.error("goal/plan-tasks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .delete("/", guard, validate("json", planTaskDeleteBody), async (c) => {
    try {
      const session = await openGoalSession(c);
      if (!session.allowed)
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const deleted = await deletePlanTask(
        supabaseAdmin,
        profileId,
        c.req.valid("json").id,
      );
      if (!deleted) return goalFail(c, 404, NOT_FOUND);

      return c.json({} satisfies z.input<typeof planTaskDeleteResponse>);
    } catch (error) {
      console.error("goal/plan-tasks error:", error);
      return goalFail(c, 500, UNHANDLED);
    }
  })
  .all("/", methodNotAllowed("GET", "POST", "PUT", "DELETE"));
