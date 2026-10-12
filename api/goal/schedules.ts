// GET/POST/PUT/DELETE /api/goal/schedules
// Authorization: Bearer <access_token>
//
// 목표관리 "중요일정"(#41 목록 / #40 등록·수정 모달, 대시보드 ScheduleRail, 사이드바
// 카운트 뱃지가 공유) CRUD 엔드포인트. 컨벤션은 api/goal/intake.js · api/goal/student.js ·
// api/goal/daily-record.js 하우스 스타일을 그대로 따른다(openGoalSession, config.runtime,
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

import type { VercelRequest, VercelResponse } from "@vercel/node";
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
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// api/_lib/goal/repo.ts(.js, Stage3 대상)의 openGoalSession 반환 shape을 그 함수 자체에서
// 추론해 재사용한다(중복 선언 없이 JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

// sql/74_goal_schedules.sql goal_schedules_category_check 와 정확히 같은 값 4종
// (src/lib/goal/scheduleCategory.js의 코드 목록과도 동일 — 프론트/DB CHECK/여기 셋이
// 어긋나면 안 되므로 값을 바꿀 땐 세 곳을 함께 고친다).
const CATEGORY_VALUES = new Set(["performance", "exam", "deadline", "etc"]);

const TITLE_MAX_LENGTH = 100;
const MEMO_MAX_LENGTH = 1000;
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// 검증 헬퍼 (api/goal/intake.js 관례 재사용 — 화이트리스트 우선, 클라이언트 값 불신)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 "형제 프로퍼티는 undefined" 유니온을
// 자동 추론해(validated.error / validated.value 접근이 좁혀진다) 매 반환 지점마다
// 넓은 유니온 타입 주석을 손으로 적지 않아도 된다(순수 타입 추론 편의, 런타임
// JSON 응답 바이트는 이전과 동일하다 — { error: { status, body } }).
function fail(status: number, body: Record<string, unknown>) {
  return { status, body };
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

function validateTitle(raw: unknown) {
  if (typeof raw !== "string")
    return { error: fail(400, { detail: "일정 이름이 올바르지 않습니다." }) };
  const title = raw.trim();
  if (!title)
    return { error: fail(400, { detail: "일정 이름을 입력해 주세요." }) };
  if (title.length > TITLE_MAX_LENGTH) {
    return {
      error: fail(400, { detail: "일정 이름은 100자 이내여야 합니다." }),
    };
  }
  return { value: title };
}

function validateCategory(raw: unknown) {
  if (typeof raw !== "string" || !CATEGORY_VALUES.has(raw)) {
    return { error: fail(400, { detail: "일정 종류를 선택해 주세요." }) };
  }
  return { value: raw };
}

// 과거 날짜도 허용한다(지난 일정을 기록·수정할 수 있어야 한다 — 팀장 지시).
function validateDueDate(raw: unknown) {
  if (typeof raw !== "string" || !DUE_DATE_RE.test(raw)) {
    return { error: fail(400, { detail: "마감일 형식이 올바르지 않습니다." }) };
  }
  if (Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
    return { error: fail(400, { detail: "마감일이 올바르지 않습니다." }) };
  }
  return { value: raw };
}

function validateMemo(raw: unknown) {
  if (raw === undefined || raw === null) return { value: "" };
  if (typeof raw !== "string")
    return { error: fail(400, { detail: "메모 형식이 올바르지 않습니다." }) };
  return { value: raw.trim().slice(0, MEMO_MAX_LENGTH) };
}

function validateId(raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: fail(400, { detail: "일정 id가 올바르지 않습니다." }) };
  }
  return { value: id };
}

/** POST/PUT 공용 — {title, category, dueDate, memo} → DB insert/update 컬럼 shape. */
function validateScheduleFields(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail(400, { detail: "요청 본문이 올바르지 않습니다." }) };

  const titleResult = validateTitle(body.title);
  if (titleResult.error) return { error: titleResult.error };

  const categoryResult = validateCategory(body.category);
  if (categoryResult.error) return { error: categoryResult.error };

  const dueDateResult = validateDueDate(body.dueDate);
  if (dueDateResult.error) return { error: dueDateResult.error };

  const memoResult = validateMemo(body.memo);
  if (memoResult.error) return { error: memoResult.error };

  return {
    value: {
      title: titleResult.value,
      category: categoryResult.value,
      due_date: dueDateResult.value,
      memo: memoResult.value,
    },
  };
}

// ---------------------------------------------------------------------------
// 온보딩 게이트 — 쓰기 3종 + GET 공용(위 파일 헤더 참고)
// ---------------------------------------------------------------------------

async function requireOnboardedStudent(
  // 호출부(아래 4개 핸들러)가 narrowGoalSession()으로 좁힌 값만 넘기므로 항상 존재한다.
  supabaseAdmin: NonNullable<GoalSession["supabaseAdmin"]>,
  profileId: NonNullable<GoalSession["profileId"]>,
) {
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  if (!row?.onboarded_at) {
    return { error: fail(409, { reason: "not_onboarded" }) };
  }
  return { row };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const rows = await fetchSchedules(supabaseAdmin, profileId);
  return res
    .status(200)
    .json({ ok: true, schedules: rows.map(buildSchedulePayload) });
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const validated = validateScheduleFields(readBody(req));
  if (validated.error) {
    return res.status(validated.error.status).json(validated.error.body);
  }

  const row = await insertSchedule(supabaseAdmin, {
    profile_id: profileId,
    ...validated.value,
  });
  return res
    .status(200)
    .json({ ok: true, schedule: buildSchedulePayload(row) });
}

async function handlePut(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const body = readBody(req);
  if (!isPlainObject(body)) {
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });
  }

  const idResult = validateId(body.id);
  if (idResult.error) {
    return res.status(idResult.error.status).json(idResult.error.body);
  }

  const validated = validateScheduleFields(body);
  if (validated.error) {
    return res.status(validated.error.status).json(validated.error.body);
  }

  const row = await updateSchedule(
    supabaseAdmin,
    profileId,
    idResult.value,
    validated.value,
  );
  if (!row) {
    return res.status(404).json({ detail: "일정을 찾을 수 없습니다." });
  }

  return res
    .status(200)
    .json({ ok: true, schedule: buildSchedulePayload(row) });
}

async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireOnboardedStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const body = readBody(req);
  const idResult = validateId(isPlainObject(body) ? body.id : undefined);
  if (idResult.error) {
    return res.status(idResult.error.status).json(idResult.error.body);
  }

  const deleted = await deleteSchedule(
    supabaseAdmin,
    profileId,
    idResult.value,
  );
  if (!deleted) {
    return res.status(404).json({ detail: "일정을 찾을 수 없습니다." });
  }

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

    if (req.method === "GET") return await handleGet(req, res, session);
    if (req.method === "POST") return await handlePost(req, res, session);
    if (req.method === "PUT") return await handlePut(req, res, session);
    return await handleDelete(req, res, session);
  } catch (error) {
    console.error("goal/schedules error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
