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
// api/goal/student.js·plan-tasks.js 관례를 따라 한 파일에 둔다. GET 미결제는
// 200 {allowed:false}, POST 미결제는 403 PAID_MESSAGE — 조회형/쓰기형 규약이
// 갈리는 이유는 api/_lib/goal/repo.ts openGoalSession 주석 참고.
//
// ── 모든 진입점 공통 선행 reconcile ────────────────────────────────────────
// GET·start·stop·heartbeat·setTarget·addSubject 전부 reconcileTimerState 를 먼저 거친다
// (api/_lib/goal/repo.ts), (a) 자정을 넘겨 방치된 열린 세션을 날짜 경계마다 분할 마감
// (b) 하트비트가 5분 넘게 끊긴 열린 세션을 그 시각으로 강제 마감. 둘 다
// 멱등이라 여러 진입점이 중복 호출해도 안전하다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
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
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// api/_lib/goal/repo.ts(.js, Stage3 대상)가 세부 세션 행 타입을 내보내지 않아 이 파일
// 로컬에서만 쓰는 최소 shape. subject/started_at만 이 파일이 실제로 읽는다.
type TimerSessionRow = { subject: string; started_at: string } | null;

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
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

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const session = await openGoalSession(req);
  if (session.error) {
    return sendError(
      res,
      "detail",
      session.error.status,
      session.error.body.detail as string,
    );
  }

  const { allowed } = session;

  // 조회형 규약 — 미결제는 에러가 아니다(student.js 관례 동일).
  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const now = new Date();
  const [summary, targets, visibleSubjects] = await Promise.all([
    fetchTimerDaySummary(supabaseAdmin, profileId, now),
    fetchSubjectTargets(supabaseAdmin, profileId),
    fetchVisibleTimerSubjects(supabaseAdmin, profileId),
  ]);

  return res.status(200).json({
    date: summary.date,
    serverNow: now.toISOString(),
    running: summary.running,
    subjects: summary.subjects,
    totalSeconds: summary.totalSeconds,
    targets,
    visibleSubjects,
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const session = await openGoalSession(req);
  if (session.error) {
    return sendError(
      res,
      "detail",
      session.error.status,
      session.error.body.detail as string,
    );
  }

  const { allowed } = session;

  // 쓰기형이므로 미결제는 403이다(조회형만 200 {allowed:false}).
  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const body = readBody(req);
  const action = body?.action;
  const now = new Date();

  if (action === "start") {
    const subject = body?.subject;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return res.status(400).json({ detail: "유효하지 않은 과목입니다." });
    }
    const row = await startTimerSession(supabaseAdmin, profileId, subject, now);
    return res.status(200).json({ ok: true, running: runningPayload(row) });
  }

  if (action === "stop") {
    const row = await stopTimerSession(supabaseAdmin, profileId, now);
    // 멱등 — 열린 세션이 없었어도(row === null) 200 {ok:true, running:null}.
    void row;
    return res.status(200).json({ ok: true, running: null });
  }

  if (action === "heartbeat") {
    const row = await touchTimerHeartbeat(supabaseAdmin, profileId, now);
    return res.status(200).json({ ok: true, running: runningPayload(row) });
  }

  if (action === "setTarget") {
    const subject = body?.subject;
    const targetHours = body?.targetHours;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return res.status(400).json({ detail: "유효하지 않은 과목입니다." });
    }
    if (!isValidTargetHours(targetHours)) {
      return res
        .status(400)
        .json({ detail: "목표 시간은 0~24 사이여야 합니다." });
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
    return res.status(200).json({ ok: true, target });
  }

  if (action === "addSubject") {
    const subject = body?.subject;
    if (!TIMER_SUBJECTS.includes(subject)) {
      return res.status(400).json({ detail: "유효하지 않은 과목입니다." });
    }
    // 다른 액션과 동일하게 선행 reconcile — addTimerSubject 자체는 세션에 영향이
    // 없지만 진입점 전체를 같은 정리 상태로 맞춰 둔다(setTarget과 동일 이유).
    await reconcileTimerState(supabaseAdmin, profileId, now);
    const visibleSubjects = await addTimerSubject(
      supabaseAdmin,
      profileId,
      subject,
    );
    return res.status(200).json({ ok: true, visibleSubjects });
  }

  return res.status(400).json({ detail: "알 수 없는 action 입니다." });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      return await handleGet(req, res);
    }
    if (req.method === "POST") {
      return await handlePost(req, res);
    }
    return sendError(res, "detail", 405, "Method not allowed");
  } catch (error) {
    console.error("goal/timer error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
