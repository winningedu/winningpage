// POST /api/selfeval/session
// Authorization: Bearer <access_token>
//
// 자기평가서 세션 엔드포인트(계획서 §2 2, 3, 8). action 으로 가른다. 요청, 응답 계약은 shared/selfeval/session.ts 다.
//   create   기본 입력을 받아 세션을 만든다(current_step 1). 차감은 여기서 하지 않는다.
//   update   기본 입력 수정. 활동을 고르기 전(단계 1 이하)에만 가능하다.
//   discard  미완 세션 파기. 이미 차감했어도 되돌리지 않는다(§2 8).
//
//   200 { session }  (create, update. 모양은 reports 상세의 session 과 같다)
//   200 {}           (discard)
//   400 VALIDATION_FAILED (요청 형식, 수정할 때 합친 값의 영역 규칙)
//   400 PLAN_ITEM_INVALID
//   403 NO_ENTITLEMENT { tenantReason? }
//   404 SESSION_NOT_FOUND
//   409 QUOTA_EXHAUSTED { tenantReason? } / SESSION_OPEN { openSessionId } / SESSION_LOCKED / SESSION_NOT_OPEN
//
// 요청 형식은 validate 가 먼저 거르고, 이용권(403)은 그 다음에 본다. 규칙은 api/_lib/selfeval/sessionBody.ts 의 순수 함수가 가진다.

import type { Context } from "hono";
import type { z } from "zod";
import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import { sessionBody } from "../../../shared/selfeval/session.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, validationFailed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  readSelfevalAccess,
  readSelfevalQuota,
  selfevalProblem,
} from "../../_lib/selfeval/access.js";
import {
  type Db,
  insertSession,
  loadGrowthSnapshot,
  loadOpenSession,
  loadSession,
  terminateSession,
  updateSession,
} from "../../_lib/selfeval/db.js";
import {
  applySessionPatch,
  buildSessionPatch,
  buildSessionRow,
  canEditBasics,
  normalizeBasics,
  sessionToInput,
  validatePlanItem,
} from "../../_lib/selfeval/sessionBody.js";
import { detailBody } from "../../_lib/selfeval/view.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

type Body = z.output<typeof sessionBody>;
type CreateBody = Extract<Body, { action: "create" }>;
type UpdateBody = Extract<Body, { action: "update" }>;
type DiscardBody = Extract<Body, { action: "discard" }>;

const NOT_FOUND = "자기평가서 세션을 찾을 수 없어요.";

const guard = user({
  unhandledMessage: "자기평가서 세션 처리에 실패했습니다.",
  logLabel: "selfeval/session",
  headers: { "Cache-Control": "no-store" },
});

async function sessionOpenConflict(db: Db, userId: string) {
  const open = await loadOpenSession(db, userId);
  return selfevalProblem(
    409,
    SELFEVAL_ERROR.SESSION_OPEN,
    "작성 중인 자기평가서가 있어요. 이어서 쓰거나 파기해 주세요.",
    { openSessionId: open?.id ?? null },
  );
}

async function create(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  body: CreateBody,
) {
  const { action: _action, ...basics } = body;
  const input = normalizeBasics(basics);
  // 회차가 0 이면 생성 전에 막는다(명세 No.101). null 은 무제한이라 통과한다.
  const quota = await readSelfevalQuota(db, userId);
  if (quota.quotaRemaining === 0) {
    throw selfevalProblem(
      409,
      SELFEVAL_ERROR.QUOTA_EXHAUSTED,
      "남은 이용 횟수가 없어요. 이용권을 확인해 주세요.",
      tenantReasonExtra(quota.capReason),
    );
  }
  if ((await loadOpenSession(db, userId)) !== null) {
    throw await sessionOpenConflict(db, userId);
  }
  const snapshot = await loadGrowthSnapshot(db, userId);
  const plan = validatePlanItem(input, snapshot);
  if (!plan.ok) throw selfevalProblem(400, plan.code, plan.message);
  const inserted = await insertSession(
    db,
    buildSessionRow(input, userId, { snapshot }),
  );
  if (!inserted.ok) throw await sessionOpenConflict(db, userId);
  return c.json({ session: detailBody(inserted.session, [], []).session });
}

async function update(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  body: UpdateBody,
) {
  const { action: _action, sessionId, ...patch } = body;
  const session = await loadSession(db, userId, sessionId);
  if (!session) {
    throw selfevalProblem(404, SELFEVAL_ERROR.SESSION_NOT_FOUND, NOT_FOUND);
  }
  if (!canEditBasics(session)) {
    throw selfevalProblem(
      409,
      SELFEVAL_ERROR.SESSION_LOCKED,
      "활동을 고른 뒤에는 기본 입력을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.",
    );
  }
  const merged = applySessionPatch(sessionToInput(session), patch);
  if (!merged.ok) return validationFailed(c, merged.errors);
  const plan = validatePlanItem(merged.input, session.growth_snapshot);
  if (!plan.ok) throw selfevalProblem(400, plan.code, plan.message);
  const updated = await updateSession(db, userId, session.id, {
    ...buildSessionPatch(merged.input, session),
    last_activity_at: new Date().toISOString(),
  });
  return c.json({ session: detailBody(updated, [], []).session });
}

async function discard(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  body: DiscardBody,
) {
  // 되돌림은 하지 않는다. 파기는 학생의 선택이라 차감을 유지한다(계획서 §2 8).
  const result = await terminateSession(
    db,
    userId,
    body.sessionId,
    null,
    "discarded",
  );
  if (!result.ok) {
    if (result.reason === "not_found") {
      throw selfevalProblem(404, SELFEVAL_ERROR.SESSION_NOT_FOUND, NOT_FOUND);
    }
    throw selfevalProblem(
      409,
      SELFEVAL_ERROR.SESSION_NOT_OPEN,
      "이미 닫힌 세션이에요.",
    );
  }
  return c.json({});
}

export const session = userFactory
  .createApp()
  .post("/", guard, validate("json", sessionBody), async (c) => {
    const body = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    const access = await readSelfevalAccess(db, me.id);
    if (!access.allowed) {
      throw selfevalProblem(
        403,
        SELFEVAL_ERROR.NO_ENTITLEMENT,
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
        tenantReasonExtra(access.tenantReason),
      );
    }
    if (body.action === "create") return create(c, db, me.id, body);
    if (body.action === "update") return update(c, db, me.id, body);
    return discard(c, db, me.id, body);
  })
  .all("/", methodNotAllowed("POST"));
