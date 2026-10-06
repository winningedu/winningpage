// POST /api/selfeval/pick-records
// Authorization: Bearer <access_token>
//
// 자기평가서 활동 선택 엔드포인트(계획서 §2 4, 5, 명세 No.26~36). body.action 으로 가른다.
//   list    후보 목록과 현재 선택, 자동 추천, 성장설계 연동 정보.
//   select  핵심 1개와 보조 최대 2개를 확정한다(current_step 2).
//   manual  직접 입력 활동 1건을 만들어 핵심으로 확정한다. 분석이 학생 입력으로 이미 채워져
//           분석 단계를 건너뛰고 current_step 3 으로 올린다(명세 No.26).
//
//   list   200 { ok, candidates[CandidateRow], selection:{coreId,supportIds}|null,
//                auto:{coreId,supportIds,coreMismatch,noneAboveThreshold}|null,
//                sourceCounts:{performance,deep,manual,total}, direction:{mismatch}|null,
//                planCandidates[], planItem|null, growthApplied, currentStep }
//   select 200 { ok, selection:{coreId,supportIds}, coreMismatch, warnings[], currentStep:2 }
//   manual 200 { ok, activityRecordId, selection:{coreId,supportIds:[]}, currentStep:3 }
//
//   400 INVALID_BODY / ACTIVITY_NAME_REQUIRED / SUBJECT_REQUIRED
//       / CORE_REQUIRED / UNAVAILABLE / UNKNOWN_ACTIVITY / TOO_MANY_SUPPORT
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND
//   409 SESSION_NOT_OPEN / STEP_ORDER { requiredStep } / SESSION_LOCKED
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 pick.ts, pickBody.ts, manual.ts,
// growth.ts 의 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { fail, hasSelfevalAccess } from "../_lib/selfeval/access.js";
import {
  type Db,
  insertManualActivity,
  loadActivityRecords,
  loadSession,
  loadSessionActivities,
  loadUsedActivityIds,
  replaceSessionActivities,
  updateSession,
} from "../_lib/selfeval/db.js";
import { directionMismatch, matchPlanItems } from "../_lib/selfeval/growth.js";
import {
  manualToAnalysis,
  manualToRecordInsert,
} from "../_lib/selfeval/manual.js";
import {
  applySelection,
  assignRoles,
  autoSelect,
  buildCandidates,
  sourceCounts,
} from "../_lib/selfeval/pick.js";
import {
  canChangeSelection,
  manualSelectionRow,
  nextStepAfterManualPick,
  nextStepAfterPick,
  pickContextFrom,
  selectionRows,
  validatePickBody,
} from "../_lib/selfeval/pickBody.js";
import type { SessionRow } from "../_lib/selfeval/rows.js";
import { guardStep } from "../_lib/selfeval/session.js";

const NOT_FOUND = "자기평가서 세션을 찾을 수 없어요.";
const LOCKED_MESSAGE =
  "분석을 시작한 뒤에는 활동을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.";

/** 후보 계산에 필요한 읽기. list 와 select 가 같은 후보를 보도록 한곳에서 만든다. */
async function loadCandidates(db: Db, userId: string, session: SessionRow) {
  const records = await loadActivityRecords(db, userId);
  const usedKey =
    session.area === "subject" ? session.subject : session.activity_name;
  const used =
    session.area === null || usedKey === null
      ? new Set<string>()
      : await loadUsedActivityIds(db, userId, session.area, usedKey);
  const ctx = pickContextFrom(session, used);
  return { records, ctx, candidates: buildCandidates(records, ctx) };
}

async function handleList(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
) {
  const guard = guardStep(session.current_step, "pick");
  if (!guard.ok) {
    fail(res, 409, guard.code, "기본 입력을 먼저 저장해 주세요.", {
      requiredStep: guard.requiredStep,
    });
    return;
  }
  const { records, ctx, candidates } = await loadCandidates(
    db,
    userId,
    session,
  );
  const chosen = await loadSessionActivities(db, userId, session.id);
  const core = chosen.find((c) => c.role === "core");
  const selection = core
    ? {
        coreId: core.activity_record_id,
        supportIds: chosen
          .filter((c) => c.role === "support")
          .map((c) => c.activity_record_id),
      }
    : null;
  // 선택이 없으면 자동 추천을 미리 표시한다. 확정은 학생이 select 로 한다.
  const auto = selection ? null : autoSelect(candidates, ctx);
  const marked = selection ?? (auto?.coreId ? auto : null);
  const rows = marked
    ? assignRoles(candidates, marked.coreId as string, marked.supportIds)
    : candidates;

  const snapshot = ctx.growthApplied ? ctx.growth : null;
  const matchCtx = {
    area: ctx.area,
    subject: ctx.subject,
    activityName: ctx.activityName,
  };
  const planCandidates = snapshot ? matchPlanItems(snapshot, matchCtx) : [];
  res.status(200).json({
    ok: true,
    candidates: rows,
    selection,
    auto,
    sourceCounts: sourceCounts(records),
    direction: snapshot
      ? { mismatch: directionMismatch(snapshot, matchCtx, planCandidates) }
      : null,
    planCandidates,
    planItem:
      snapshot?.planItems.find((p) => p.id === session.plan_item_id) ?? null,
    growthApplied: snapshot !== null,
    currentStep: session.current_step,
  });
}

async function handleSelect(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
  body: { coreId: string; supportIds: string[] },
) {
  const { candidates, ctx } = await loadCandidates(db, userId, session);
  const applied = applySelection(candidates, body, ctx);
  if (!applied.ok) {
    fail(res, 400, applied.code, applied.message);
    return;
  }
  await replaceSessionActivities(
    db,
    userId,
    session.id,
    selectionRows(
      session.id,
      userId,
      candidates,
      applied.coreId,
      applied.supportIds,
    ),
  );
  const step = nextStepAfterPick(session.current_step);
  await updateSession(db, userId, session.id, {
    current_step: step,
    last_activity_at: new Date().toISOString(),
  });
  res.status(200).json({
    ok: true,
    selection: { coreId: applied.coreId, supportIds: applied.supportIds },
    coreMismatch: applied.coreMismatch,
    warnings: applied.warnings,
    currentStep: step,
  });
}

async function handleManual(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
  input: Parameters<typeof manualToRecordInsert>[0],
) {
  const activityRecordId = await insertManualActivity(
    db,
    manualToRecordInsert(input, userId),
  );
  await replaceSessionActivities(db, userId, session.id, [
    manualSelectionRow(
      session.id,
      userId,
      activityRecordId,
      manualToAnalysis(input),
    ),
  ]);
  const step = nextStepAfterManualPick(session.current_step);
  await updateSession(db, userId, session.id, {
    current_step: step,
    last_activity_at: new Date().toISOString(),
  });
  res.status(200).json({
    ok: true,
    activityRecordId,
    selection: { coreId: activityRecordId, supportIds: [] },
    currentStep: step,
  });
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 활동 선택에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/pick-records",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = validatePickBody(req.body);
    if (!parsed.ok) {
      fail(res, 400, parsed.code, parsed.message);
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
    const { body } = parsed;
    const session = await loadSession(db, userId, body.sessionId);
    if (!session) {
      fail(res, 404, "SESSION_NOT_FOUND", NOT_FOUND);
      return;
    }
    if (session.status !== "draft" && session.status !== "in_progress") {
      fail(res, 409, "SESSION_NOT_OPEN", "이미 닫힌 세션이에요.");
      return;
    }
    if (body.action === "list") {
      await handleList(res, db, userId, session);
      return;
    }
    if (!canChangeSelection(session)) {
      fail(res, 409, "SESSION_LOCKED", LOCKED_MESSAGE);
      return;
    }
    if (body.action === "select") {
      await handleSelect(res, db, userId, session, body);
      return;
    }
    await handleManual(res, db, userId, session, body.input);
  },
});

export const config = { runtime: "nodejs", maxDuration: 30 };
