// POST /api/inquiry/recommend-topics
// Authorization: Bearer <access_token>
//
// 심화탐구 주제 추천(명세 No.19, 22, 53, 54, 개발계획 §2 9, 10, 부록 B 1번).
//   요청  { sessionId: uuid, seedTopic?: string | null }
//   응답 200 { ok, round, topics: TopicView[3], charged, quota: QuotaView, attempts, gradeNote,
//             session: SessionView }
//         session 은 갱신된 세션 뷰다(status, currentStep, topicRoundCount 를 재조회 없이 반영).
//         charged 는 이번 요청이 세션 1회를 차감했는지다(이미 차감된 세션의 재추천은 false).
//         예비 주제(자산 0건)는 topics 의 linkageType 이 interest_based_provisional 이다.
//
// 오류 코드(실패 본문 { ok: false, error: { code, message }, ...extra })
//   INVALID_BODY 400, NO_ENTITLEMENT 403(미차감 세션인데 이용권이 없음), SESSION_NOT_FOUND 404,
//   SESSION_NOT_OPEN 409, SESSION_LOCKED 409(설계 리포트가 이미 있음),
//   STEP_ORDER 409(기본 정보가 비어 있음), ROUND_LIMIT 409(재추천 상한, extra.maxRounds),
//   GENERATION_RUNNING 409(같은 단계 실행 중, 3초 뒤 재시도),
//   ATTEMPTS_EXHAUSTED 409(시도 상한, 세션 종결, terminal true),
//   GENERATION_VALIDATION_FAILED 422, MODEL_UPSTREAM_FAILED 502, GENERATION_TIMEOUT 504,
//   GENERATION_FATAL 500(복구 불가, 세션 종결, terminal true), METHOD_NOT_ALLOWED 405, INTERNAL 500.
//   모델 실패류의 extra 는 attempts, issues, terminal, generation 이다.
//
// 차감: 첫 추천이 저장된 직후 세션이 draft 면 consume_inquiry_credit 을 한 번 부르고 성공하면
//   in_progress 로 올린다. 거절돼도 응답은 막지 않고 charged false 로 알린다. 다음 설계 요청이
//   draft 세션의 차감을 다시 시도해 막는다. 되돌림은 세션 종결 때만 한다(러너가 처리).
//   실패 응답은 세션이 draft 일 때 "이용 횟수는 차감되지 않았어요" 를 메시지에 덧붙인다.
//
// 핸들러는 바디 검증, 세션 조회, 입력 조립, runGeneration 호출, HTTP 매핑만 한다. 판단은
// _lib/inquiry/recommendFlow.ts, 러너는 _lib/inquiry/generate.ts 에서 검증한다.

import { callStructured } from "../_lib/ai/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import {
  fail,
  hasInquiryAccess,
  loadAssetViews,
  loadHandoffView,
  loadSessionParts,
  NO_ENTITLEMENT_MESSAGE,
  readInquiryQuota,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import { loadRecordsByIds, loadSession } from "../_lib/inquiry/db.js";
import {
  type GenerationSpec,
  generationErrorOf,
  retryNotesFor,
  runGeneration,
} from "../_lib/inquiry/generate.js";
import {
  consumeCredit,
  loadAllTopics,
  markSessionInProgress,
  saveTopicRound,
} from "../_lib/inquiry/generateDb.js";
import { buildTopicsPrompt } from "../_lib/inquiry/prompts.js";
import {
  buildTopicsInput,
  type FinalTopic,
  finalizeTopics,
  isProvisional,
  persistRecommendation,
  precheckTopics,
  topicRowsOf,
  validateRecommendBody,
} from "../_lib/inquiry/recommendFlow.js";
import { gradeNote } from "../_lib/inquiry/stage.js";
import { validateTopicsResponse } from "../_lib/inquiry/validation.js";
import { type TopicRow, toTopicView } from "../_lib/inquiry/views.js";

const NOT_CHARGED_NOTE = " 이용 횟수는 차감되지 않았어요.";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "주제 추천에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/recommend-topics",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const body = validateRecommendBody(req.body);
    if (!body.ok) {
      fail(res, 400, "INVALID_BODY", body.reason);
      return;
    }
    const { sessionId, seedTopic } = body.body;

    const row = await loadSession(db, userId, sessionId);
    if (!row) {
      fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
      return;
    }

    const pre = precheckTopics(row);
    if (!pre.ok) {
      const { ok: _ok, ...rest } = pre;
      const e = generationErrorOf({ kind: "precheck", ...rest });
      fail(res, e.status, e.code, e.message, e.extra);
      return;
    }
    const { round, info } = pre;

    // 미차감 세션은 선점 전에 이용권을 확인한다. 거절된 요청이 시도 횟수를 올리지 않는다.
    const uncharged = row.status === "draft";
    if (uncharged && !(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }

    const nowIso = new Date().toISOString();
    const assets = await loadAssetViews(db, userId, sessionId);
    const [records, previous, handoff] = await Promise.all([
      loadRecordsByIds(
        db,
        userId,
        assets.flatMap((a) => (a.activityRecordId ? [a.activityRecordId] : [])),
      ),
      loadAllTopics(db, userId, sessionId),
      row.growth_report_id
        ? loadHandoffView(db, userId, {
            grade: info.gradeLabel,
            subject: info.subject,
            nowIso,
          })
        : Promise.resolve(null),
    ]);
    const excludedTitles = previous.map(
      (t) => (t.detail as { title: string }).title,
    );
    const provisional = isProvisional(assets);
    const base = buildTopicsInput({
      info,
      assets,
      records,
      excludedTitles,
      seedTopic,
      handoff,
      planItemId: row.plan_item_id,
    });

    const deps = {
      callStructured,
      now: () => new Date().toISOString(),
      startedAt,
    };
    const spec: GenerationSpec<
      FinalTopic[],
      { topics: TopicRow[]; charged: boolean }
    > = {
      mode: "topic_recommendation",
      precheck: () => pre,
      prompt: buildTopicsPrompt({ ...base, retryNotes: [] }),
      validate: (value) => {
        const r = validateTopicsResponse(value, {
          expectProvisional: provisional,
          excludedTitles,
        });
        return r.ok
          ? {
              ok: true,
              value: finalizeTopics(r.topics, {
                grade: info.gradeLabel,
                provisional,
              }),
            }
          : { ok: false, issues: r.issues };
      },
      retryPrompt: (issues, truncated) =>
        buildTopicsPrompt({
          ...base,
          retryNotes: retryNotesFor(issues, truncated),
        }),
      persist: (finals) =>
        persistRecommendation(
          {
            saveTopicRound: (rows) =>
              saveTopicRound(db, userId, sessionId, round, rows, deps.now()),
            consume: () => consumeCredit(db, sessionId, userId),
            markInProgress: () => markSessionInProgress(db, userId, sessionId),
          },
          {
            status: row.status,
            rows: topicRowsOf(sessionId, userId, round, finals),
          },
        ),
    };

    const outcome = await runGeneration(db, userId, sessionId, spec, deps);
    if (outcome.kind !== "ok") {
      const e = generationErrorOf(outcome);
      fail(
        res,
        e.status,
        e.code,
        uncharged ? `${e.message}${NOT_CHARGED_NOTE}` : e.message,
        e.extra,
      );
      return;
    }

    const fresh = await loadSession(db, userId, sessionId);
    if (!fresh) {
      throw new Error(`inquiry_sessions ${sessionId}: 생성 뒤 행이 없습니다.`);
    }
    res.status(200).json({
      ok: true,
      round,
      topics: outcome.saved.topics.map(toTopicView),
      charged: outcome.saved.charged,
      quota: await readInquiryQuota(db, userId),
      attempts: outcome.attempts,
      gradeNote: gradeNote(info.gradeLabel),
      session: (await loadSessionParts(db, userId, fresh)).session,
    });
  },
});
