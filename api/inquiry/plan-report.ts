// POST /api/inquiry/plan-report
// Authorization: Bearer <access_token>
//
// 심화탐구 설계 리포트(명세 No.25, 39, 59~70, 개발계획 §2 12, 13, 15, 16, 부록 B 2번).
//   요청  { sessionId: uuid, topicId: uuid }
//   응답 200 { ok, design: DesignView, topic: TopicView, designReportId, session: SessionView,
//             attempts, result: "ok" | "done" }
//         session 은 갱신된 세션 뷰다(클라이언트가 재조회 없이 designReportId, currentStep, status 를 반영한다).
//         result "done" 은 같은 주제로 이미 만든 설계를 다시 요청한 멱등 응답이다(저장분을 돌려준다).
//         attempts 는 design_report 모델 호출 누계다.
//
// 오류 코드(실패 본문 { ok: false, error: { code, message }, ...extra })
//   INVALID_BODY 400, NO_ENTITLEMENT 403(미차감 세션의 차감 재시도가 거절됨),
//   SESSION_NOT_FOUND 404, SESSION_NOT_OPEN 409, STEP_ORDER 409(기본 정보가 비어 있음),
//   TOPIC_NOT_IN_ROUND 409(최신 라운드 후보가 아님), SESSION_LOCKED 409(설계가 이미 있는 세션에 다른 주제),
//   GENERATION_RUNNING 409, ATTEMPTS_EXHAUSTED 409(terminal true),
//   GENERATION_VALIDATION_FAILED 422, MODEL_UPSTREAM_FAILED 502, GENERATION_TIMEOUT 504,
//   GENERATION_FATAL 500(terminal true), METHOD_NOT_ALLOWED 405, INTERNAL 500.
//   모델 실패류의 extra 는 attempts, issues, terminal, generation 이다.
//
// 주제 선택은 설계 저장과 함께 한다(selected 표시, selected_topic_id, design_report_id, current_step 3).
// 생성이 실패하면 선택이 남지 않아 다른 주제로 다시 시도할 수 있다.
// 세션이 draft 면(첫 추천 때 차감하지 못한 경우) 선점 전에 차감을 다시 시도하고 거절이면 403 이다.
// 자료 출처표의 출처와 기준 시점은 서버가 "확인 필요" 로 고정한다.
//
// 핸들러는 바디 검증, 세션 조회, 입력 조립, runGeneration 호출, HTTP 매핑만 한다. 판단은
// _lib/inquiry/designFlow.ts, 러너는 _lib/inquiry/generate.ts 에서 검증한다.

import { callStructured } from "../_lib/ai/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { asGradeLabel } from "../_lib/inquiry/bootstrap.js";
import {
  fail,
  loadAssetViews,
  loadHandoffView,
  loadSessionParts,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import type { Db } from "../_lib/inquiry/db.js";
import {
  loadDesignReport,
  loadLatestRoundTopics,
  loadPlanItem,
  loadRecordsByIds,
  loadSession,
  loadTopic,
} from "../_lib/inquiry/db.js";
import {
  buildDesignInput,
  decideDesign,
  designReportRow,
  designValidator,
  precheckDesign,
  validateDesignBody,
} from "../_lib/inquiry/designFlow.js";
import {
  type GenerationSpec,
  generationErrorOf,
  retryNotesFor,
  runGeneration,
} from "../_lib/inquiry/generate.js";
import {
  consumeCredit,
  markSessionInProgress,
  saveDesign,
} from "../_lib/inquiry/generateDb.js";
import { buildDesignPrompt } from "../_lib/inquiry/prompts.js";
import { parseGenerationState } from "../_lib/inquiry/session.js";
import { stageLabel, stageOf } from "../_lib/inquiry/stage.js";
import type { DesignReport } from "../_lib/inquiry/types.js";
import {
  type AssetView,
  primaryAssetOf,
  primaryReliability,
  type ReportRow,
  type SessionRow,
  type TopicView,
  toDesignView,
  toTopicView,
} from "../_lib/inquiry/views.js";

async function designViewOf(
  db: Db,
  userId: string,
  row: SessionRow,
  report: ReportRow,
  topic: TopicView,
  assets: AssetView[],
) {
  const grade = asGradeLabel(row.grade_label);
  if (!grade) {
    throw new Error(`inquiry_sessions ${row.id}: grade_label 이 없습니다.`);
  }
  const planItem = row.plan_item_id
    ? await loadPlanItem(db, userId, row.plan_item_id)
    : null;
  return toDesignView(report, {
    topic,
    primaryAsset: primaryAssetOf(assets),
    reliability: primaryReliability(assets),
    planItemTitle: planItem?.title ?? null,
    stageLabel: stageLabel(stageOf(grade)),
  });
}

async function freshSessionView(db: Db, userId: string, sessionId: string) {
  const fresh = await loadSession(db, userId, sessionId);
  if (!fresh)
    throw new Error(`inquiry_sessions ${sessionId}: 생성 뒤 행이 없습니다.`);
  return (await loadSessionParts(db, userId, fresh)).session;
}

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "설계 리포트 생성에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/plan-report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const body = validateDesignBody(req.body);
    if (!body.ok) {
      fail(res, 400, "INVALID_BODY", body.reason);
      return;
    }
    const { sessionId, topicId } = body.body;

    const row = await loadSession(db, userId, sessionId);
    if (!row) {
      fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
      return;
    }

    const latest = await loadLatestRoundTopics(db, userId, sessionId);
    const decision = decideDesign({
      session: row,
      topicId,
      latestRoundTopicIds: latest.map((t) => t.id),
    });
    if (decision.kind === "error") {
      fail(res, decision.status, decision.code, decision.message);
      return;
    }

    const assets = await loadAssetViews(db, userId, sessionId);

    if (decision.kind === "done") {
      const [report, topicRow] = await Promise.all([
        loadDesignReport(db, userId, sessionId),
        loadTopic(db, userId, topicId),
      ]);
      if (!report || !topicRow) {
        throw new Error(
          `inquiry_sessions ${sessionId}: 설계 리포트 행이 없습니다.`,
        );
      }
      const topic = toTopicView(topicRow);
      res.status(200).json({
        ok: true,
        design: await designViewOf(db, userId, row, report, topic, assets),
        topic,
        designReportId: report.id,
        session: (await loadSessionParts(db, userId, row)).session,
        attempts: parseGenerationState(row.generation_state).modes.design_report
          .attempts,
        result: "done",
      });
      return;
    }

    // 첫 추천 때 차감하지 못한 세션은 선점 전에 차감을 다시 시도한다(거절이면 선점하지 않는다).
    if (decision.retryCharge) {
      const c = await consumeCredit(db, sessionId, userId);
      if (!(c.charged || c.status === "already_charged")) {
        fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
        return;
      }
      await markSessionInProgress(db, userId, sessionId);
    }

    const pre = precheckDesign(row, topicId);
    if (!pre.ok) {
      const { ok: _ok, ...rest } = pre;
      const e = generationErrorOf({ kind: "precheck", ...rest });
      fail(res, e.status, e.code, e.message, e.extra);
      return;
    }
    const { info } = pre;

    const topicRow = latest.find((t) => t.id === topicId);
    if (!topicRow) throw new Error("최신 라운드 주제를 찾지 못했습니다.");
    const topic = toTopicView(topicRow);
    const nowIso = new Date().toISOString();
    const [records, handoff] = await Promise.all([
      loadRecordsByIds(
        db,
        userId,
        assets.flatMap((a) => (a.activityRecordId ? [a.activityRecordId] : [])),
      ),
      row.growth_report_id
        ? loadHandoffView(db, userId, {
            grade: info.gradeLabel,
            subject: info.subject,
            nowIso,
          })
        : Promise.resolve(null),
    ]);
    const base = buildDesignInput({
      info,
      topic,
      assets,
      records,
      handoff,
      planItemId: row.plan_item_id,
    });

    const deps = {
      callStructured,
      now: () => new Date().toISOString(),
      startedAt,
    };
    const spec: GenerationSpec<DesignReport, ReportRow> = {
      mode: "design_report",
      precheck: () => pre,
      prompt: buildDesignPrompt({ ...base, retryNotes: [] }),
      validate: designValidator(base.primaryAsset.reliability),
      retryPrompt: (issues, truncated) =>
        buildDesignPrompt({
          ...base,
          retryNotes: retryNotesFor(issues, truncated),
        }),
      persist: (design) =>
        saveDesign(
          db,
          userId,
          sessionId,
          topicId,
          designReportRow(sessionId, userId, topicId, design),
          deps.now(),
        ),
    };

    const outcome = await runGeneration(db, userId, sessionId, spec, deps);
    if (outcome.kind !== "ok") {
      const e = generationErrorOf(outcome);
      fail(res, e.status, e.code, e.message, e.extra);
      return;
    }

    res.status(200).json({
      ok: true,
      design: await designViewOf(
        db,
        userId,
        row,
        outcome.saved,
        { ...topic, selected: true },
        assets,
      ),
      topic: { ...topic, selected: true },
      designReportId: outcome.saved.id,
      session: await freshSessionView(db, userId, sessionId),
      attempts: outcome.attempts,
      result: "ok",
    });
  },
});
