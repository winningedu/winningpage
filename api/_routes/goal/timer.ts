// GET/POST /api/goal/timer
// Authorization: Bearer <access_token>
//
// 열공 타이머(#25) 서버 시각 기반 영속화. Timer.jsx(:8-11 옛 TODO)의 로컬
// setInterval mock을 대체한다 — 원본 외부 앱(target)은 클라이언트가 계산한
// 초를 그대로 서버가 저장하는 변조 가능 구조였다("클라이언트가 보낸 시간값은
// 어떤 것도 신뢰·저장하지 않는다" 임무 지시 확정). started_at/ended_at/
// duration_seconds 는 전부 api/_lib/goal/repo.ts 의 서버 now() 계산이 정본이고,
// 이 파일은 그 결과를 카멜 케이스로 옮기기만 한다.
//
// ── 메서드가 GET/POST 둘 다인 이유 ────────────────────────────────────────
// 조회(GET, 바디 없음)와 쓰기(POST, {action, ...})가 같은 리소스를 다루므로
// api/_routes/goal/student.js·plan-tasks.js 관례를 따라 한 파일에 둔다. GET 미결제는
// 200 {allowed:false}, POST 미결제는 403 PAID_MESSAGE — 조회형/쓰기형 규약이
// 갈리는 이유는 api/_lib/goal/repo.ts openGoalSession 주석 참고.
//
// ── 모든 진입점 공통 선행 reconcile ────────────────────────────────────────
// GET·start·stop·heartbeat·setTarget·addSubject 전부 reconcileTimerState 를 먼저 거친다
// (api/_lib/goal/repo.ts), (a) 자정을 넘겨 방치된 열린 세션을 날짜 경계마다 분할 마감
// (b) 하트비트가 5분 넘게 끊긴 열린 세션을 그 시각으로 강제 마감. 둘 다
// 멱등이라 여러 진입점이 중복 호출해도 안전하다.

import type { Context } from "hono";
import { goalFail } from "../../_lib/goal/problem.js";
import {
  addTimerSubject,
  fetchSubjectTargets,
  fetchTimerDaySummary,
  fetchVisibleTimerSubjects,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  reconcileTimerState,
  startTimerSession,
  stopTimerSession,
  TIMER_SUBJECTS,
  touchTimerHeartbeat,
  upsertSubjectTarget,
} from "../../_lib/goal/repo.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

// api/_lib/goal/repo.ts(.js, Stage3 대상)가 세부 세션 행 타입을 내보내지 않아 이 파일
// 로컬에서만 쓰는 최소 shape. subject/started_at만 이 파일이 실제로 읽는다.
type TimerSessionRow = { subject: string; started_at: string } | null;

// 본문을 JSON 으로 읽는다. 비었거나 깨졌으면 null 이고, 형식 검사는 각 핸들러가 한다.
async function readBody(c: Context) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function isValidTargetHours(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 24;
}

function runningPayload(row: TimerSessionRow) {
  return row ? { subject: row.subject, startedAt: row.started_at } : null;
}

async function handleGet(c: Context<UserEnv>) {
  const session = await openGoalSession(c);

  const { allowed } = session;

  // 조회형 규약 — 미결제는 에러가 아니다(student.js 관례 동일).
  if (!allowed) {
    return c.json({
      allowed: false,
      ...tenantReasonExtra(session.tenantReason),
    });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const now = new Date();
  const [summary, targets, visibleSubjects] = await Promise.all([
    fetchTimerDaySummary(supabaseAdmin, profileId, now),
    fetchSubjectTargets(supabaseAdmin, profileId),
    fetchVisibleTimerSubjects(supabaseAdmin, profileId),
  ]);

  return c.json({
    date: summary.date,
    serverNow: now.toISOString(),
    running: summary.running,
    subjects: summary.subjects,
    totalSeconds: summary.totalSeconds,
    targets,
    visibleSubjects,
  });
}

async function handlePost(c: Context<UserEnv>) {
  const session = await openGoalSession(c);

  const { allowed } = session;

  // 쓰기형이므로 미결제는 403이다(조회형만 200 {allowed:false}).
  if (!allowed) {
    return goalFail(c, 403, {
      detail: PAID_MESSAGE,
      ...tenantReasonExtra(session.tenantReason),
    });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const body = await readBody(c);
  const action = body?.action;
  const now = new Date();

  if (action === "start") {
    const subject = body?.subject;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return goalFail(c, 400, { detail: "유효하지 않은 과목입니다." });
    }
    const row = await startTimerSession(supabaseAdmin, profileId, subject, now);
    return c.json({ running: runningPayload(row) });
  }

  if (action === "stop") {
    const row = await stopTimerSession(supabaseAdmin, profileId, now);
    // 멱등 — 열린 세션이 없었어도(row === null) 200 {ok:true, running:null}.
    void row;
    return c.json({ running: null });
  }

  if (action === "heartbeat") {
    const row = await touchTimerHeartbeat(supabaseAdmin, profileId, now);
    return c.json({ running: runningPayload(row) });
  }

  if (action === "setTarget") {
    const subject = body?.subject;
    const targetHours = body?.targetHours;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return goalFail(c, 400, { detail: "유효하지 않은 과목입니다." });
    }
    if (!isValidTargetHours(targetHours)) {
      return goalFail(c, 400, { detail: "목표 시간은 0~24 사이여야 합니다." });
    }
    // 다른 액션과 동일하게 선행 reconcile을 거친다 — 목표 설정 자체는 세션에
    // 영향이 없지만, 진입점 전체를 같은 정리 상태로 맞춰 두면 그 직후 GET이
    // 부정확한 running/subjects를 보여줄 여지가 사라진다.
    await reconcileTimerState(supabaseAdmin, profileId, now);
    const target = await upsertSubjectTarget(
      supabaseAdmin,
      profileId,
      subject,
      Number(targetHours),
    );
    return c.json({ target });
  }

  if (action === "addSubject") {
    const subject = body?.subject;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return goalFail(c, 400, { detail: "유효하지 않은 과목입니다." });
    }
    // 다른 액션과 동일하게 선행 reconcile — addTimerSubject 자체는 세션에 영향이
    // 없지만 진입점 전체를 같은 정리 상태로 맞춰 둔다(setTarget과 동일 이유).
    await reconcileTimerState(supabaseAdmin, profileId, now);
    const visibleSubjects = await addTimerSubject(
      supabaseAdmin,
      profileId,
      subject,
    );
    return c.json({ visibleSubjects });
  }

  return goalFail(c, 400, { detail: "알 수 없는 action 입니다." });
}

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/timer",
});

export const timer = userFactory
  .createApp()
  .on(["GET", "POST"], "/", guard, async (c) => {
    try {
      if (c.req.method === "GET") {
        return await handleGet(c);
      }
      if (c.req.method === "POST") {
        return await handlePost(c);
      }
      return goalFail(c, 405, { detail: "Method not allowed" });
    } catch (error) {
      console.error("goal/timer error:", error);
      return goalFail(c, 500, { detail: "처리 중 오류가 발생했습니다." });
    }
  })
  .all("/", methodNotAllowed("GET", "POST"));
