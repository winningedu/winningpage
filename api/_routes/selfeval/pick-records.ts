// POST /api/selfeval/pick-records
// Authorization: Bearer <access_token>
//
// 자기평가서 활동 선택 엔드포인트(계획서 §2 4, 5, 명세 No.26~36, 174~196). body.action 으로 가른다.
//   list          후보 목록, 저장된 연계, 현재 선택, 자동 추천, 성장설계 연동 정보.
//   link          연계 판정(모델 1회, 이용 횟수 차감 없음). 판정을 마쳤으면 저장된 값을 돌려준다.
//   delete-link   { fromId, toId } 연계를 지운다(deleted 표시, 다시 제안하지 않는다).
//   confirm-link  { fromId, toId } 암묵 연계를 "실제로 이어서 했어요" 로 확인한다.
//   add-link      { fromId, toId, type, note } 학생이 선을 긋는다. note 한 줄 필수.
//   select        핵심 1개와 보조(핵심 포함 최대 N건)를 확정한다(current_step 2).
//   manual        직접 입력 활동 1건을 만들어 핵심으로 확정한다(current_step 3).
//
//   list, link, delete-link, confirm-link, add-link 는 같은 본문을 돌려준다.
//     200 { ok, candidates[CandidateRow], selection:{coreId,supportIds}|null,
//           auto:{coreId,supportIds,coreMismatch,noneAboveThreshold}|null,
//           links[RecordLink], linkStatus:"pending"|"ok"|"unchecked", linkUnchecked,
//           maxSelect, excludedIds[], sourceCounts, direction, planCandidates[], planItem,
//           growthApplied, currentStep }
//     link 는 { cached, attempts?, linkError? } 를 더한다. 호출 실패나 시도 소진이면 200 으로
//     linkUnchecked true 와 적합도 상위 3건 추천을 돌려주고 세션은 닫지 않는다(명세 No.196).
//   select 200 { ok, selection, coreMismatch, warnings[], excludedIds[], maxSelect, currentStep:2 }
//   manual 200 { ok, activityRecordId, selection:{coreId,supportIds:[]}, currentStep:3 }
//
//   400 INVALID_BODY / ACTIVITY_NAME_REQUIRED / SUBJECT_REQUIRED
//       / CORE_REQUIRED / UNAVAILABLE / UNKNOWN_ACTIVITY / TOO_MANY_SUPPORT
//       / NOTE_REQUIRED / INVALID_LINK_TYPE / SAME_ACTIVITY
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND / LINK_NOT_FOUND
//   409 SESSION_NOT_OPEN / STEP_ORDER { requiredStep } / SESSION_LOCKED / STEP_RUNNING
//
// 규칙은 pick.ts, pickList.ts, pickBody.ts, link*.ts, steps/link.ts 에서 검증한다.

import type { VercelResponse } from "@vercel/node";
import { callStructured } from "../../_lib/ai/gemini.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { fail, readSelfevalAccess } from "../../_lib/selfeval/access.js";
import {
  type Db,
  insertManualActivity,
  loadActivityRecords,
  loadRecordLinks,
  loadSession,
  loadSessionActivities,
  loadUsedActivityIds,
  replaceSessionActivities,
  saveRecordLink,
  updateSession,
} from "../../_lib/selfeval/db.js";
import {
  directionMismatch,
  matchPlanItems,
} from "../../_lib/selfeval/growth.js";
import {
  applyAddLink,
  applyConfirmLink,
  applyDeleteLink,
} from "../../_lib/selfeval/linkEdit.js";
import {
  manualToAnalysis,
  manualToRecordInsert,
} from "../../_lib/selfeval/manual.js";
import {
  applySelection,
  autoSelect,
  buildCandidates,
  sourceCounts,
} from "../../_lib/selfeval/pick.js";
import {
  canChangeSelection,
  manualSelectionRow,
  nextStepAfterManualPick,
  nextStepAfterPick,
  type PickBody,
  pickContextFrom,
  selectionRows,
  validatePickBody,
} from "../../_lib/selfeval/pickBody.js";
import {
  composePickList,
  type LinkStatus,
  linkStatusOf,
  unlinkedIds,
  visibleLinks,
} from "../../_lib/selfeval/pickList.js";
import type { SessionRow } from "../../_lib/selfeval/rows.js";
import { outcomeToHttp } from "../../_lib/selfeval/runModelStep.js";
import { guardStep } from "../../_lib/selfeval/session.js";
import { sendOutcome } from "../../_lib/selfeval/stepResponse.js";
import { runLinkStep } from "../../_lib/selfeval/steps/link.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

const NOT_FOUND = "자기평가서 세션을 찾을 수 없어요.";
const UNLINKED_WARNING = "다른 기록과 이어지는 지점을 찾지 못했어요";
const LOCKED_MESSAGE =
  "분석을 시작한 뒤에는 활동을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.";

/** 후보 계산에 필요한 읽기. list 와 select 와 연계 편집이 같은 후보를 보도록 한곳에서 만든다. */
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

async function loadSelection(db: Db, userId: string, session: SessionRow) {
  const chosen = await loadSessionActivities(db, userId, session.id);
  const core = chosen.find((c) => c.role === "core");
  return core
    ? {
        coreId: core.activity_record_id,
        supportIds: chosen
          .filter((c) => c.role === "support")
          .map((c) => c.activity_record_id),
      }
    : null;
}

/** list 응답 본문. 연계 판정과 편집 응답도 같은 모양을 돌려줘 화면이 한 번에 다시 그린다. */
async function listPayload(
  db: Db,
  userId: string,
  session: SessionRow,
  statusOverride?: LinkStatus,
) {
  const { records, ctx, candidates } = await loadCandidates(
    db,
    userId,
    session,
  );
  const selection = await loadSelection(db, userId, session);
  const status = statusOverride ?? linkStatusOf(session.step_state);
  const links = visibleLinks(status, await loadRecordLinks(db, session.id));
  const composed = composePickList({
    rows: candidates,
    links,
    status,
    selection,
    targetChars: session.target_chars,
  });
  const snapshot = ctx.growthApplied ? ctx.growth : null;
  const matchCtx = {
    area: ctx.area,
    subject: ctx.subject,
    activityName: ctx.activityName,
  };
  const planCandidates = snapshot ? matchPlanItems(snapshot, matchCtx) : [];
  return {
    ok: true,
    ...composed,
    selection,
    sourceCounts: sourceCounts(records),
    direction: snapshot
      ? { mismatch: directionMismatch(snapshot, matchCtx, planCandidates) }
      : null,
    planCandidates,
    planItem:
      snapshot?.planItems.find((p) => p.id === session.plan_item_id) ?? null,
    growthApplied: snapshot !== null,
    currentStep: session.current_step,
  };
}

async function handleList(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
) {
  if (!requirePickStep(res, session)) return;
  res.status(200).json(await listPayload(db, userId, session));
}

function requirePickStep(res: VercelResponse, session: SessionRow): boolean {
  const guard = guardStep(session.current_step, "pick");
  if (guard.ok) return true;
  fail(res, 409, guard.code, "기본 입력을 먼저 저장해 주세요.", {
    requiredStep: guard.requiredStep,
  });
  return false;
}

async function handleSelect(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
  body: { coreId: string; supportIds: string[] },
) {
  const { candidates, ctx } = await loadCandidates(db, userId, session);
  const status = linkStatusOf(session.step_state);
  const links = visibleLinks(status, await loadRecordLinks(db, session.id));
  const { maxSelect } = composePickList({
    rows: candidates,
    links,
    status,
    selection: null,
    targetChars: session.target_chars,
  });
  const applied = applySelection(candidates, body, ctx, maxSelect);
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
  // 연계 없는 기록은 허용하되 경고하고, 학생이 한 줄을 쓰지 않으면 생성에서 뺀다(명세 No.180).
  const unlinked =
    status === "ok" || links.length > 0
      ? unlinkedIds(links, applied.supportIds)
      : [];
  res.status(200).json({
    ok: true,
    selection: { coreId: applied.coreId, supportIds: applied.supportIds },
    coreMismatch: applied.coreMismatch,
    warnings: [
      ...applied.warnings,
      ...(unlinked.length > 0 ? [UNLINKED_WARNING] : []),
    ],
    excludedIds: unlinked,
    maxSelect,
    currentStep: step,
  });
}

/** 연계 판정. 이미 판정을 마쳤으면 저장된 연계를 돌려주고 모델을 다시 부르지 않는다(명세 No.180). */
async function handleLink(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
) {
  if (!requirePickStep(res, session)) return;
  const listed = async (extra: Record<string, unknown>, status?: LinkStatus) =>
    res
      .status(200)
      .json({ ...(await listPayload(db, userId, session, status)), ...extra });
  if (linkStatusOf(session.step_state) === "ok") {
    await listed({ cached: true });
    return;
  }
  const { candidates } = await loadCandidates(db, userId, session);
  const { coreId } = autoSelect(candidates);
  if (coreId === null) {
    await listed({ cached: false });
    return;
  }
  const out = await runLinkStep(
    db,
    userId,
    session,
    {
      callStructured,
      now: () => new Date().toISOString(),
      startedAt: Date.now(),
    },
    candidates,
    coreId,
  );
  if (out.kind === "skipped") {
    await listed({ cached: false });
    return;
  }
  if (out.kind === "ok") {
    await listed({ cached: false, attempts: out.attempts }, "ok");
    return;
  }
  if (out.kind === "failure" || out.kind === "exhausted") {
    // 연계 확인이 안 돼도 세션은 이어간다. 적합도 상위 3건 추천으로 돌아간다(명세 No.196).
    await listed(
      { cached: false, linkError: outcomeToHttp(out).code },
      "unchecked",
    );
    return;
  }
  sendOutcome(res, out, () => ({}));
}

async function handleLinkEdit(
  res: VercelResponse,
  db: Db,
  userId: string,
  session: SessionRow,
  body: Extract<
    PickBody,
    { action: "delete-link" | "confirm-link" | "add-link" }
  >,
) {
  const stored = await loadRecordLinks(db, session.id);
  const result =
    body.action === "delete-link"
      ? applyDeleteLink(stored, body.fromId, body.toId)
      : body.action === "confirm-link"
        ? applyConfirmLink(stored, body.fromId, body.toId)
        : applyAddLink(
            stored,
            body,
            new Set(
              (await loadCandidates(db, userId, session)).candidates
                .filter((r) => r.fit !== null)
                .map((r) => r.activity.id),
            ),
          );
  if (!result.ok) {
    fail(
      res,
      result.code === "LINK_NOT_FOUND" ? 404 : 400,
      result.code,
      result.message,
    );
    return;
  }
  await saveRecordLink(db, session.id, result.link);
  await updateSession(db, userId, session.id, {
    last_activity_at: new Date().toISOString(),
  });
  res.status(200).json(await listPayload(db, userId, session, "ok"));
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
    const access = await readSelfevalAccess(db, userId);
    if (!access.allowed) {
      fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
        tenantReasonExtra(access.tenantReason),
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
    if (body.action === "link") {
      await handleLink(res, db, userId, session);
      return;
    }
    if (
      body.action === "delete-link" ||
      body.action === "confirm-link" ||
      body.action === "add-link"
    ) {
      await handleLinkEdit(res, db, userId, session, body);
      return;
    }
    await handleManual(res, db, userId, session, body.input);
  },
});

export const config = { runtime: "nodejs", maxDuration: 60 };
