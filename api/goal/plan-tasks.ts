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
// GET은 조회형이라 200 {allowed:false}(§ api/goal/student.js 관례), 나머지
// 셋은 쓰기형이라 403 PAID_MESSAGE(§ api/goal/intake.js 관례)다. 조회형을
// 403으로 주면 entitlement.js가 그걸 "판정 불가(null)"로 접어 가드가
// 오작동한다 — 두 파일에 이미 있는 규약을 그대로 따른다.
//
// ── "일정(오늘만/이번 주만/매주 반복)" 은 이 API 계약에 없다 ────────────────
// AddTaskModal의 스케줄 셀렉트는 반복 규칙이 아니라 "몇 개의 plan_date에
// 각각 1행씩 만들지"를 결정하는 클라이언트 판단이다(sql/75 헤더 주석,
// src/lib/goalPlanUtils.js). 이 라우트는 단건 CRUD만 알고, 여러 날짜에
// 걸친 반복 생성은 클라이언트가 POST를 날짜 수만큼 반복 호출해서 만든다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
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
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// api/_lib/goal/repo.ts(.js, Stage3 대상)의 openGoalSession 반환 shape을 그 함수 자체에서
// 추론해 재사용한다(중복 선언 없이 JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX_LENGTH = 100;
const DURATION_MAX_MINUTES = 24 * 60;
// GET 기간 상한(일). WeeklyPlan.jsx는 항상 7일, StudyPlanRail.jsx는 1일 창만 쓴다 —
// 이 API 계약이 명시하지 않은 값이라 방어적으로 넓게(약 2개월) 잡았다(판단 기록).
const MAX_RANGE_DAYS = 62;

// 검증기는 전부 `return { error: fail(400, ...) }` 형태로 감싸 호출한다 — 그래서
// fail() 자신은 { status, body }만 반환해야 한다({ error: {...} }로 한 번 더 감싸면
// 호출부의 `x.error.status`가 정의되지 않아 res.status(undefined)가 ERR_HTTP_INVALID_STATUS_CODE로
// 500을 던진다 — 스모크에서 잡힌 이중 래핑 버그, 수정).
function fail(status: number, detail: string, extra?: Record<string, unknown>) {
  return { status, body: { detail, ...extra } };
}

function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// 필드 검증기 — 셋 다 값이 없으면(undefined) "제공되지 않음"으로 통과시킨다.
// PUT은 부분 수정이라 있는 필드만 검증·반영해야 한다.
// ---------------------------------------------------------------------------

/** @returns {{error?:object, value?:string}} */
function validateTitle(raw: unknown) {
  if (typeof raw !== "string")
    return { error: fail(400, "과제 내용을 입력해 주세요.") };
  const title = raw.trim();
  if (!title || title.length > TITLE_MAX_LENGTH) {
    return {
      error: fail(400, `과제 내용은 1~${TITLE_MAX_LENGTH}자 사이여야 합니다.`),
    };
  }
  return { value: title };
}

/** @returns {{error?:object, value?:string}} 한글 라벨 → DB 코드. */
function validateSubject(raw: unknown) {
  const code = SUBJECT_LABEL_TO_CODE[String(raw ?? "").trim()];
  if (!code) return { error: fail(400, "과목을 선택해 주세요.") };
  return { value: code };
}

/** @returns {{error?:object, value?:number}} */
function validateDurationMinutes(raw: unknown) {
  if (raw === undefined || raw === null) return { value: 0 };
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < 0 ||
    raw > DURATION_MAX_MINUTES
  ) {
    return {
      error: fail(
        400,
        `예상 소요 시간은 0~${DURATION_MAX_MINUTES}분 사이여야 합니다.`,
      ),
    };
  }
  return { value: Math.round(raw) };
}

function validatePlanDate(raw: unknown) {
  if (!isValidYmd(raw))
    return { error: fail(400, "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).") };
  return { value: raw };
}

function validateId(raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return { error: fail(400, "과제 id가 올바르지 않습니다.") };
  return { value: id };
}

function validateWorkbookId(raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return { error: fail(400, "문제집 id가 올바르지 않습니다.") };
  return { value: id };
}

function validatePageNumber(raw: unknown, label: string) {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return { error: fail(400, `${label}은 1 이상의 정수여야 합니다.`) };
  }
  return { value: raw };
}

export type WorkbookLinkPatch = {
  workbook_id: number | null;
  page_from: number | null;
  page_to: number | null;
};

/**
 * body의 workbookId/pageFrom/pageTo(QA 행286-B, 계획↔문제집 연결) 셋을 형태만
 * 검증한다 — 소유자·total_pages 확인은 DB 조회가 필요해 handler가 별도로 한다.
 *
 * 세 필드가 전부 없으면 { value: undefined }(이번 요청에서 손대지 않음). workbookId:
 * null이면 연결 해제(페이지도 함께 비운다) — pageFrom/pageTo가 같이 오면 모순이라
 * 거부한다. workbookId가 있으면 pageFrom·pageTo는 "둘 다 없음"(페이지 없이 연결만)
 * 또는 "둘 다 있고 pageFrom<=pageTo"만 허용한다("셋 다 함께 오거나 workbookId만
 * 허용", 임무 지시 §2).
 */
export function validateWorkbookLinkFields(body: Record<string, unknown>): {
  error?: ReturnType<typeof fail>;
  value?: WorkbookLinkPatch;
} {
  const hasWorkbookId = body.workbookId !== undefined;
  const hasPageFrom = body.pageFrom !== undefined;
  const hasPageTo = body.pageTo !== undefined;

  if (!hasWorkbookId && !hasPageFrom && !hasPageTo) {
    return {};
  }

  if (hasWorkbookId && body.workbookId === null) {
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

  if (!hasWorkbookId) {
    return {
      error: fail(400, "페이지 범위는 문제집을 선택해야 입력할 수 있습니다."),
    };
  }

  const workbookId = validateWorkbookId(body.workbookId);
  if (workbookId.error) return workbookId;

  if (!hasPageFrom && !hasPageTo) {
    return {
      value: { workbook_id: workbookId.value, page_from: null, page_to: null },
    };
  }
  if (!hasPageFrom || !hasPageTo) {
    return {
      error: fail(400, "페이지 범위는 시작과 끝을 함께 입력해야 합니다."),
    };
  }

  const pageFrom = validatePageNumber(body.pageFrom, "시작 페이지");
  if (pageFrom.error) return pageFrom;
  const pageTo = validatePageNumber(body.pageTo, "끝 페이지");
  if (pageTo.error) return pageTo;
  if (pageFrom.value > pageTo.value) {
    return { error: fail(400, "시작 페이지는 끝 페이지보다 클 수 없습니다.") };
  }

  return {
    value: {
      workbook_id: workbookId.value,
      page_from: pageFrom.value,
      page_to: pageTo.value,
    },
  };
}

/**
 * 문제집 연결 과제는 완전히 단일 날짜(선택한 그 날) 1건만 만들 수 있다(임무 지시
 * 정정, 2026-09-02) — "이번 주만"의 7일 복제도 포함해서 막는다. 페이지 범위는
 * 그 문제집의 그 구간을 가리키는데, 같은 구간을 여러 날짜에 복제하면 "완료" 체크가
 * 여러 번 눌려도 진도는 max()로 한 번만 반영돼(nextWorkbookPageAfterTaskDone) 나머지
 * 요일 체크가 눈속임이 된다 — 그래서 애초에 문제집 연결 과제는 1일 1행으로만
 * 허용한다.
 *
 * repeatSchedule는 클라이언트가 "이번 주만"/"매주 반복"처럼 여러 plan_date로
 * 펼쳐 POST할 때만 실어 보내는 자기신고 신호다(단건 POST 자체엔 반복 개념이
 * 없다, 파일 헤더 §"일정" 주석) — AddTaskModal이 문제집 연결 시 일정 select
 * 자체를 비활성해 이미 이 조합을 못 고르게 막지만, API를 직접 두드리는 우회를
 * 막는 방어선을 한 겹 더 둔다.
 */
export function validateRepeatScheduleWithWorkbook(
  body: Record<string, unknown>,
  link: WorkbookLinkPatch | undefined,
): ReturnType<typeof fail> | null {
  if (body.repeatSchedule === true && link?.workbook_id != null) {
    return fail(
      400,
      "문제집 연결 과제는 선택한 날짜 하루에만 추가할 수 있습니다.",
    );
  }
  return null;
}

const PLAN_TASK_STATUSES = new Set(["pending", "done", "fail"]);

/** @returns {{error?:object, value?:"pending"|"done"|"fail"}} */
function validateStatus(raw: unknown) {
  if (typeof raw !== "string" || !PLAN_TASK_STATUSES.has(raw)) {
    return {
      error: fail(400, "status는 pending/done/fail 중 하나여야 합니다."),
    };
  }
  return { value: raw as "pending" | "done" | "fail" };
}

/**
 * validateWorkbookLinkFields가 돌려준 형태 검증 통과 값을 실제로 DB에 대고
 * 확인한다: workbook_id가 있으면 같은 profile 소유인지(fetchWorkbookOwned가
 * 소유자 스코프까지 겸함), page_to가 있으면 그 문제집의 total_pages를 넘지
 * 않는지. workbook_id가 null(연결 해제)이거나 undefined(손대지 않음)면 그냥
 * 통과시킨다 — DB에 물어볼 게 없다.
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

// ---------------------------------------------------------------------------
// 메서드별 핸들러
// ---------------------------------------------------------------------------

async function handleGet(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 조회형 규약 — 미결제는 에러가 아니다(§ api/goal/student.js).
  if (!allowed) return res.status(200).json({ allowed: false });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const from = req.query?.from;
  const to = req.query?.to;
  if (!isValidYmd(from) || !isValidYmd(to)) {
    return res
      .status(400)
      .json({ detail: "from/to는 YYYY-MM-DD 형식이어야 합니다." });
  }
  if (from > to) {
    return res.status(400).json({ detail: "from은 to보다 이전이어야 합니다." });
  }
  const rangeDays =
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    86400000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return res
      .status(400)
      .json({ detail: `조회 기간은 최대 ${MAX_RANGE_DAYS}일까지 가능합니다.` });
  }

  const rows = await fetchPlanTasks(supabaseAdmin, profileId, from, to);
  return res
    .status(200)
    .json({ ok: true, tasks: rows.map(buildPlanTaskPayload) });
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const planDate = validatePlanDate(body.planDate);
  if (planDate.error)
    return res.status(planDate.error.status).json(planDate.error.body);

  const title = validateTitle(body.title);
  if (title.error) return res.status(title.error.status).json(title.error.body);

  const subject = validateSubject(body.subject);
  if (subject.error)
    return res.status(subject.error.status).json(subject.error.body);

  const duration = validateDurationMinutes(body.durationMinutes);
  if (duration.error)
    return res.status(duration.error.status).json(duration.error.body);

  const link = validateWorkbookLinkFields(body);
  if (link.error) return res.status(link.error.status).json(link.error.body);

  const repeatScheduleError = validateRepeatScheduleWithWorkbook(
    body,
    link.value,
  );
  if (repeatScheduleError)
    return res
      .status(repeatScheduleError.status)
      .json(repeatScheduleError.body);

  const linkError = await verifyWorkbookLink(
    supabaseAdmin,
    profileId,
    link.value,
  );
  if (linkError) return res.status(linkError.status).json(linkError.body);

  const row = await insertPlanTask(supabaseAdmin, {
    profile_id: profileId,
    plan_date: planDate.value,
    title: title.value,
    subject: subject.value,
    duration_minutes: duration.value,
    ...(link.value
      ? {
          workbook_id: link.value.workbook_id,
          page_from: link.value.page_from,
          page_to: link.value.page_to,
        }
      : {}),
  });

  return res.status(200).json({ ok: true, task: buildPlanTaskPayload(row) });
}

async function handlePut(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const id = validateId(body.id);
  if (id.error) return res.status(id.error.status).json(id.error.body);

  // 부분 수정 — 요청에 실려온 필드만 검증·반영한다.
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

  if (body.title !== undefined) {
    const title = validateTitle(body.title);
    if (title.error)
      return res.status(title.error.status).json(title.error.body);
    patch.title = title.value;
  }

  if (body.subject !== undefined) {
    const subject = validateSubject(body.subject);
    if (subject.error)
      return res.status(subject.error.status).json(subject.error.body);
    patch.subject = subject.value;
  }

  if (body.durationMinutes !== undefined) {
    const duration = validateDurationMinutes(body.durationMinutes);
    if (duration.error)
      return res.status(duration.error.status).json(duration.error.body);
    patch.duration_minutes = duration.value;
  }

  if (body.planDate !== undefined) {
    const planDate = validatePlanDate(body.planDate);
    if (planDate.error)
      return res.status(planDate.error.status).json(planDate.error.body);
    patch.plan_date = planDate.value;
  }

  // status가 단일 원본(QA 행305) — done은 status에서 파생해 항상 함께 갱신한다.
  // ✓ 버튼(체크)은 done↔pending, ✕ 버튼은 fail↔pending을 토글하는 판단은
  // 클라이언트(StudyPlanRail.tsx nextPlanTaskStatus)가 다음 status를 계산해
  // 그대로 실어 보낸다 — 이 라우트는 유효한 3값인지만 검증한다.
  if (body.status !== undefined) {
    const status = validateStatus(body.status);
    if (status.error)
      return res.status(status.error.status).json(status.error.body);
    patch.status = status.value;
    patch.done = status.value === "done";
  }

  const link = validateWorkbookLinkFields(body);
  if (link.error) return res.status(link.error.status).json(link.error.body);

  const linkError = await verifyWorkbookLink(
    supabaseAdmin,
    profileId,
    link.value,
  );
  if (linkError) return res.status(linkError.status).json(linkError.body);

  if (link.value) {
    patch.workbook_id = link.value.workbook_id;
    patch.page_from = link.value.page_from;
    patch.page_to = link.value.page_to;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ detail: "수정할 필드가 없습니다." });
  }

  const row = await updatePlanTask(supabaseAdmin, profileId, id.value, patch);
  if (!row) return res.status(404).json({ detail: "과제를 찾을 수 없습니다." });

  // 문제집 진도 전진(QA 행286-B) — 이번 PUT이 status를 done으로 "전환"했고(과거
  // 상태와 무관하게 이번 요청이 done을 보냈을 때만), 갱신된 행에 workbook_id·page_to가
  // 함께 있으면 그 문제집의 current_page를 max(기존, page_to)로 전진시킨다(상한
  // total_pages). done→pending으로 되돌릴 때는 이 분기를 타지 않는다 — 진도를
  // 자동으로 되감지 않는다(다른 과제가 이미 더 앞선 진도를 만들어 놨을 수 있어서,
  // 임무 지시 §2 "롤백 없음").
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
        await updateWorkbookOwned(supabaseAdmin, row.workbook_id, profileId, {
          current_page: nextCurrentPage,
          status: computeWorkbookStatus(nextCurrentPage, totalPages),
        });
      }
    }
  }

  return res.status(200).json({ ok: true, task: buildPlanTaskPayload(row) });
}

async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const id = validateId(body.id);
  if (id.error) return res.status(id.error.status).json(id.error.body);

  const deleted = await deletePlanTask(supabaseAdmin, profileId, id.value);
  if (!deleted)
    return res.status(404).json({ detail: "과제를 찾을 수 없습니다." });

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method || "")) {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    switch (req.method) {
      case "GET":
        return await handleGet(req, res, session);
      case "POST":
        return await handlePost(req, res, session);
      case "PUT":
        return await handlePut(req, res, session);
      case "DELETE":
        return await handleDelete(req, res, session);
      default:
        // 위 405 가드가 이미 걸렀다 — 도달하지 않는다.
        return sendError(res, "detail", 405, "Method not allowed");
    }
  } catch (error) {
    console.error("goal/plan-tasks error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
