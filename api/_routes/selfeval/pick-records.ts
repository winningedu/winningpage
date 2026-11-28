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
//     200 { candidates[CandidateRow], selection:{coreId,supportIds}|null,
//           auto:{coreId,supportIds,coreMismatch,noneAboveThreshold}|null,
//           links[RecordLink], linkStatus:"pending"|"ok"|"unchecked", linkUnchecked,
//           maxSelect, excludedIds[], sourceCounts, direction, planCandidates[], planItem,
//           growthApplied, currentStep }
//     link 는 { cached, attempts?, linkError? } 를 더한다. 호출 실패나 시도 소진이면 200 으로
//     linkUnchecked true 와 적합도 상위 3건 추천을 돌려주고 세션은 닫지 않는다(명세 No.196).
//   select 200 { selection, coreMismatch, warnings[], excludedIds[], maxSelect, currentStep:2 }
//   manual 200 { activityRecordId, selection:{coreId,supportIds:[]}, currentStep:3 }
//
//   400 VALIDATION_FAILED / ACTIVITY_NAME_REQUIRED / SUBJECT_REQUIRED
//       / CORE_REQUIRED / UNAVAILABLE / UNKNOWN_ACTIVITY / TOO_MANY_SUPPORT
//       / NOTE_REQUIRED / INVALID_LINK_TYPE / SAME_ACTIVITY
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND / LINK_NOT_FOUND
//   409 SESSION_NOT_OPEN / STEP_ORDER { requiredStep } / SESSION_LOCKED / STEP_RUNNING
//
// 요청 형식은 validate 가 먼저 거르고(계약은 shared/selfeval/pick.ts), 직접 입력의 필수 항목, 이용권, 세션 순으로 본다.
// 규칙은 pick.ts, pickList.ts, pickBody.ts, link*.ts, steps/link.ts 에서 검증한다.

import type { Context } from "hono";
import type { z } from "zod";
import {
  type PickBody,
  pickBody,
  type pickListResponseSchema,
  type pickManualResponseSchema,
  type pickSelectResponseSchema,
} from "../../../shared/selfeval/pick.js";
import { allInOrder } from "../../../src/lib/concurrency/allInOrder.js";
import { callStructured } from "../../_lib/ai/gemini.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  readSelfevalAccess,
  selfevalProblem,
} from "../../_lib/selfeval/access.js";
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
  validateManualInput,
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
  pickContextFrom,
  STEP_AFTER_MANUAL_PICK,
  STEP_AFTER_PICK,
  selectionRows,
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
import {
  assertSessionOpen,
  outcomeBody,
} from "../../_lib/selfeval/stepResponse.js";
import { runLinkStep } from "../../_lib/selfeval/steps/link.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

const NOT_FOUND = "자기평가서 세션을 찾을 수 없어요.";
const UNLINKED_WARNING = "다른 기록과 이어지는 지점을 찾지 못했어요";
const LOCKED_MESSAGE =
  "분석을 시작한 뒤에는 활동을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.";

const guard = user({
  unhandledMessage: "자기평가서 활동 선택에 실패했습니다.",
  logLabel: "selfeval/pick-records",
  headers: { "Cache-Control": "no-store" },
});

/** 후보 계산에 필요한 읽기. list 와 select 와 연계 편집이 같은 후보를 보도록 한곳에서 만든다. */
async function loadCandidates(db: Db, userId: string, session: SessionRow) {
  const usedKey =
    session.area === "subject" ? session.subject : session.activity_name;
  // 사용한 활동 id 는 세션 필드에서 정해져 활동 읽기와 서로 기다릴 필요가 없다.
  const [records, used] = await allInOrder(
    loadActivityRecords(db, userId),
    session.area === null || usedKey === null
      ? Promise.resolve(new Set<string>())
      : loadUsedActivityIds(db, userId, session.area, usedKey),
  );
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
  const status = statusOverride ?? linkStatusOf(session.step_state);
  // 후보, 선택, 연계 읽기는 모두 세션으로 정해져 서로 기다릴 필요가 없다.
  const [{ records, ctx, candidates }, selection, savedLinks] =
    await allInOrder(
      loadCandidates(db, userId, session),
      loadSelection(db, userId, session),
      loadRecordLinks(db, session.id),
    );
  const links = visibleLinks(status, savedLinks);
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

/** 선택 단계(단계 1 이상)인지 본다. 아니면 409 STEP_ORDER 를 던진다. */
function requirePickStep(session: SessionRow): void {
  const step = guardStep(session.current_step, "pick");
  if (step.ok) return;
  throw selfevalProblem(409, step.code, "기본 입력을 먼저 저장해 주세요.", {
    requiredStep: step.requiredStep,
  });
}

async function handleList(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  session: SessionRow,
) {
  requirePickStep(session);
  return c.json(
    (await listPayload(db, userId, session)) satisfies z.output<
      typeof pickListResponseSchema
    >,
  );
}

async function handleSelect(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  session: SessionRow,
  body: Extract<PickBody, { action: "select" }>,
) {
  const [{ candidates, ctx }, savedLinks] = await allInOrder(
    loadCandidates(db, userId, session),
    loadRecordLinks(db, session.id),
  );
  const status = linkStatusOf(session.step_state);
  const links = visibleLinks(status, savedLinks);
  const { maxSelect } = composePickList({
    rows: candidates,
    links,
    status,
    selection: null,
    targetChars: session.target_chars,
  });
  const applied = applySelection(candidates, body, ctx, maxSelect);
  if (!applied.ok) throw selfevalProblem(400, applied.code, applied.message);
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
  await updateSession(db, userId, session.id, {
    current_step: STEP_AFTER_PICK,
    last_activity_at: new Date().toISOString(),
  });
  // 연계 없는 기록은 허용하되 경고하고, 학생이 한 줄을 쓰지 않으면 생성에서 뺀다(명세 No.180).
  const unlinked =
    status === "ok" || links.length > 0
      ? unlinkedIds(links, applied.supportIds)
      : [];
  return c.json({
    selection: { coreId: applied.coreId, supportIds: applied.supportIds },
    coreMismatch: applied.coreMismatch,
    warnings: [
      ...applied.warnings,
      ...(unlinked.length > 0 ? [UNLINKED_WARNING] : []),
    ],
    excludedIds: unlinked,
    maxSelect,
    currentStep: STEP_AFTER_PICK,
  } satisfies z.output<typeof pickSelectResponseSchema>);
}

async function handleManual(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  session: SessionRow,
  input: Extract<PickBody, { action: "manual" }>["input"],
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
  await updateSession(db, userId, session.id, {
    current_step: STEP_AFTER_MANUAL_PICK,
    last_activity_at: new Date().toISOString(),
  });
  return c.json({
    activityRecordId,
    selection: { coreId: activityRecordId, supportIds: [] },
    currentStep: STEP_AFTER_MANUAL_PICK,
  } satisfies z.output<typeof pickManualResponseSchema>);
}

async function handleLinkEdit(
  c: Context<UserEnv>,
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
    throw selfevalProblem(
      result.code === "LINK_NOT_FOUND" ? 404 : 400,
      result.code,
      result.message,
    );
  }
  await saveRecordLink(db, session.id, result.link);
  await updateSession(db, userId, session.id, {
    last_activity_at: new Date().toISOString(),
  });
  return c.json(
    await listPayload(db, userId, session, linkStatusOf(session.step_state)),
  );
}

/** 연계 판정. 이미 판정을 마쳤으면 저장된 연계를 돌려주고 모델을 다시 부르지 않는다(명세 No.180). */
async function handleLink(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  session: SessionRow,
) {
  requirePickStep(session);
  const listed = async (extra: Record<string, unknown>, status?: LinkStatus) =>
    c.json({ ...(await listPayload(db, userId, session, status)), ...extra });
  if (linkStatusOf(session.step_state) === "ok") {
    return listed({ cached: true });
  }
  const { candidates } = await loadCandidates(db, userId, session);
  const { coreId } = autoSelect(candidates);
  if (coreId === null) return listed({ cached: false });
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
  if (out.kind === "skipped") return listed({ cached: false });
  if (out.kind === "ok") {
    return listed({ cached: false, attempts: out.attempts }, "ok");
  }
  if (out.kind === "failure" || out.kind === "exhausted") {
    // 연계 확인이 안 돼도 세션은 이어간다. 적합도 상위 3건 추천으로 돌아간다(명세 No.196).
    return listed(
      { cached: false, linkError: outcomeToHttp(out).code },
      "unchecked",
    );
  }
  return c.json(outcomeBody(out, () => ({})));
}

export const pickRecords = userFactory
  .createApp()
  .post("/", guard, validate("json", pickBody), async (c) => {
    const body: PickBody = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    // 직접 입력의 필수 항목은 도메인 규칙이라 이용권과 세션을 보기 전에 거른다.
    if (body.action === "manual") {
      const checked = validateManualInput(body.input);
      if (!checked.ok) {
        throw selfevalProblem(400, checked.code, checked.message);
      }
    }
    const access = await readSelfevalAccess(db, me.id);
    if (!access.allowed) {
      throw selfevalProblem(
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
        tenantReasonExtra(access.tenantReason),
      );
    }
    const session = await loadSession(db, me.id, body.sessionId);
    if (!session) {
      throw selfevalProblem(404, "SESSION_NOT_FOUND", NOT_FOUND);
    }
    assertSessionOpen(session, false);
    if (body.action === "list") return handleList(c, db, me.id, session);
    if (!canChangeSelection(session)) {
      throw selfevalProblem(409, "SESSION_LOCKED", LOCKED_MESSAGE);
    }
    if (body.action === "select")
      return handleSelect(c, db, me.id, session, body);
    if (body.action === "link") return handleLink(c, db, me.id, session);
    if (
      body.action === "delete-link" ||
      body.action === "confirm-link" ||
      body.action === "add-link"
    ) {
      return handleLinkEdit(c, db, me.id, session, body);
    }
    return handleManual(c, db, me.id, session, body.input);
  })
  .all("/", methodNotAllowed("POST"));
