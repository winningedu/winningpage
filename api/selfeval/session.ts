// POST /api/selfeval/session
// Authorization: Bearer <access_token>
//
// 자기평가서 세션 엔드포인트(계획서 §2 2, 3, 8). action 으로 가른다.
//   create   기본 입력을 받아 세션을 만든다(current_step 1). 차감은 여기서 하지 않는다.
//   update   기본 입력 수정. 활동을 고르기 전(단계 1 이하)에만 가능하다.
//   discard  미완 세션 파기. 이미 차감했어도 되돌리지 않는다(§2 8).
//
//   200 { ok, session }  (create, update. 모양은 reports 상세의 session 과 같다)
//   200 { ok }           (discard)
//   400 INVALID_BODY { reason: 세부 코드 }
//   400 PLAN_ITEM_INVALID
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND
//   409 QUOTA_EXHAUSTED / SESSION_OPEN { openSessionId } / SESSION_LOCKED / SESSION_NOT_OPEN
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 api/_lib/selfeval/sessionBody.ts 의
// 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import {
  fail,
  hasSelfevalAccess,
  readSelfevalQuota,
} from "../_lib/selfeval/access.js";
import {
  type Db,
  insertSession,
  loadGrowthSnapshot,
  loadOpenSession,
  loadSession,
  terminateSession,
  updateSession,
} from "../_lib/selfeval/db.js";
import {
  applySessionPatch,
  buildSessionPatch,
  buildSessionRow,
  canEditBasics,
  readSessionAction,
  sessionToInput,
  validatePlanItem,
  validateSessionCreateBody,
  validateSessionDiscardBody,
  validateSessionUpdateBody,
} from "../_lib/selfeval/sessionBody.js";
import { detailBody } from "../_lib/selfeval/view.js";

const NOT_FOUND = "자기평가서 세션을 찾을 수 없어요.";

function invalidBody(
  res: VercelResponse,
  v: { code: string; message: string },
) {
  fail(res, 400, "INVALID_BODY", v.message, { reason: v.code });
}

async function sessionOpenConflict(
  res: VercelResponse,
  db: Db,
  userId: string,
) {
  const open = await loadOpenSession(db, userId);
  fail(
    res,
    409,
    "SESSION_OPEN",
    "작성 중인 자기평가서가 있어요. 이어서 쓰거나 파기해 주세요.",
    { openSessionId: open?.id ?? null },
  );
}

async function handleCreate(
  res: VercelResponse,
  db: Db,
  userId: string,
  body: unknown,
) {
  const parsed = validateSessionCreateBody(body);
  if (!parsed.ok) {
    invalidBody(res, parsed);
    return;
  }
  // 회차가 0 이면 생성 전에 막는다(명세 No.101). null 은 무제한이라 통과한다.
  const quota = await readSelfevalQuota(db, userId);
  if (quota.quotaRemaining === 0) {
    fail(
      res,
      409,
      "QUOTA_EXHAUSTED",
      "남은 이용 횟수가 없어요. 이용권을 확인해 주세요.",
    );
    return;
  }
  if ((await loadOpenSession(db, userId)) !== null) {
    await sessionOpenConflict(res, db, userId);
    return;
  }
  const snapshot = await loadGrowthSnapshot(db, userId);
  const plan = validatePlanItem(parsed.input, snapshot);
  if (!plan.ok) {
    fail(res, 400, plan.code, plan.message);
    return;
  }
  const inserted = await insertSession(
    db,
    buildSessionRow(parsed.input, userId, { snapshot }),
  );
  if (!inserted.ok) {
    await sessionOpenConflict(res, db, userId);
    return;
  }
  res
    .status(200)
    .json({ ok: true, session: detailBody(inserted.session, [], []).session });
}

async function handleUpdate(
  res: VercelResponse,
  db: Db,
  userId: string,
  body: unknown,
) {
  const parsed = validateSessionUpdateBody(body);
  if (!parsed.ok) {
    invalidBody(res, parsed);
    return;
  }
  const session = await loadSession(db, userId, parsed.sessionId);
  if (!session) {
    fail(res, 404, "SESSION_NOT_FOUND", NOT_FOUND);
    return;
  }
  if (!canEditBasics(session)) {
    fail(
      res,
      409,
      "SESSION_LOCKED",
      "활동을 고른 뒤에는 기본 입력을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.",
    );
    return;
  }
  const merged = applySessionPatch(sessionToInput(session), parsed.patch);
  if (!merged.ok) {
    invalidBody(res, merged);
    return;
  }
  const plan = validatePlanItem(merged.input, session.growth_snapshot);
  if (!plan.ok) {
    fail(res, 400, plan.code, plan.message);
    return;
  }
  const updated = await updateSession(db, userId, session.id, {
    ...buildSessionPatch(merged.input, session),
    last_activity_at: new Date().toISOString(),
  });
  res
    .status(200)
    .json({ ok: true, session: detailBody(updated, [], []).session });
}

async function handleDiscard(
  res: VercelResponse,
  db: Db,
  userId: string,
  body: unknown,
) {
  const parsed = validateSessionDiscardBody(body);
  if (!parsed.ok) {
    invalidBody(res, parsed);
    return;
  }
  // 되돌림은 하지 않는다. 파기는 학생의 선택이라 차감을 유지한다(계획서 §2 8).
  const result = await terminateSession(
    db,
    userId,
    parsed.sessionId,
    null,
    "discarded",
  );
  if (!result.ok) {
    if (result.reason === "not_found") {
      fail(res, 404, "SESSION_NOT_FOUND", NOT_FOUND);
    } else {
      fail(res, 409, "SESSION_NOT_OPEN", "이미 닫힌 세션이에요.");
    }
    return;
  }
  res.status(200).json({ ok: true });
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 세션 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/session",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const action = readSessionAction(req.body);
    if (action === null) {
      fail(
        res,
        400,
        "INVALID_BODY",
        "action 은 create, update, discard 중 하나여야 해요.",
      );
      return;
    }
    if (!(await hasSelfevalAccess(db, userId))) {
      fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
      );
      return;
    }
    if (action === "create") await handleCreate(res, db, userId, req.body);
    else if (action === "update") await handleUpdate(res, db, userId, req.body);
    else await handleDiscard(res, db, userId, req.body);
  },
});

export const config = { runtime: "nodejs", maxDuration: 30 };
