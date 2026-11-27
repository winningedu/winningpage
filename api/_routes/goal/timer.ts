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
import type { z } from "zod";
import {
  timerBody,
  type timerGetResponse,
} from "../../../shared/goal/timer.js";
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
  touchTimerHeartbeat,
  upsertSubjectTarget,
} from "../../_lib/goal/repo.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

// repo.ts 가 세부 세션 행 타입을 내보내지 않아 이 파일이 읽는 subject, started_at 만 둔다.
type TimerSessionRow = { subject: string; started_at: string } | null;

function runningPayload(row: TimerSessionRow) {
  return row ? { subject: row.subject, startedAt: row.started_at } : null;
}

async function handleGet(c: Context<UserEnv>) {
  const session = await openGoalSession(c);

  const { allowed } = session;

  // 조회형 규약: 미결제는 에러가 아니다(student.js 관례 동일).
  if (!allowed) {
    return c.json({
      allowed: false,
      ...tenantReasonExtra(session.tenantReason),
    } satisfies z.input<typeof timerGetResponse>);
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

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/timer",
});

export const timer = userFactory
  .createApp()
  .get("/", guard, async (c) => {
    try {
      return await handleGet(c);
    } catch (error) {
      console.error("goal/timer error:", error);
      return goalFail(c, 500, { detail: "처리 중 오류가 발생했습니다." });
    }
  })
  .post("/", guard, validate("json", timerBody), async (c) => {
    try {
      const session = await openGoalSession(c);

      // 쓰기형이므로 미결제는 403이다(조회형만 200 {allowed:false}).
      if (!session.allowed) {
        return goalFail(c, 403, {
          detail: PAID_MESSAGE,
          ...tenantReasonExtra(session.tenantReason),
        });
      }

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const body = c.req.valid("json");
      const now = new Date();

      if (body.action === "start") {
        const row = await startTimerSession(
          supabaseAdmin,
          profileId,
          body.subject,
          now,
        );
        return c.json({ running: runningPayload(row) });
      }

      if (body.action === "stop") {
        // 멱등: 열린 세션이 없었어도 200 {running:null}.
        await stopTimerSession(supabaseAdmin, profileId, now);
        return c.json({ running: null });
      }

      if (body.action === "heartbeat") {
        const row = await touchTimerHeartbeat(supabaseAdmin, profileId, now);
        return c.json({ running: runningPayload(row) });
      }

      if (body.action === "setTarget") {
        // 다른 액션과 동일하게 선행 reconcile을 거친다. 목표 설정 자체는 세션에
        // 영향이 없지만, 진입점 전체를 같은 정리 상태로 맞춰 두면 그 직후 GET이
        // 부정확한 running/subjects를 보여줄 여지가 사라진다.
        await reconcileTimerState(supabaseAdmin, profileId, now);
        const target = await upsertSubjectTarget(
          supabaseAdmin,
          profileId,
          body.subject,
          body.targetHours,
        );
        return c.json({ target });
      }

      // addSubject: setTarget과 같은 이유로 선행 reconcile.
      await reconcileTimerState(supabaseAdmin, profileId, now);
      const visibleSubjects = await addTimerSubject(
        supabaseAdmin,
        profileId,
        body.subject,
      );
      return c.json({ visibleSubjects });
    } catch (error) {
      console.error("goal/timer error:", error);
      return goalFail(c, 500, { detail: "처리 중 오류가 발생했습니다." });
    }
  })
  .all("/", methodNotAllowed("GET", "POST"));
