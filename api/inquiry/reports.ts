// GET /api/inquiry/reports
// Authorization: Bearer <access_token>
//
// 심화탐구 저장 리포트 조회 엔드포인트(명세 No.116~118, 개발계획 부록 A 4번).
// 목록과 상세를 한 GET 라우트로 묶는다(growth/reports.ts 와 같은 관례).
//
//   ① 목록 `GET /api/inquiry/reports`
//      200 { ok, items: [{ sessionId, completedAt, subject, topicTitle, linkKind, score, label }],
//            open: { sessionId, currentStep, subject, topicTitle|null, lastActivityAt }|null,
//            archived: [{ sessionId, subject, topicTitle|null, lastActivityAt,
//                         terminal: { reason, mode }|null }] }
//      items 는 완료(completed) 세션만 completedAt 내림차순이다. archived 는 종결 사유가 있으면
//      terminal 에 담고 없으면(만료) null 이다.
//   ② 상세 `GET /api/inquiry/reports?sessionId=<uuid>`
//      200 { ok, session: SessionView, assets: AssetView[], topics: TopicView[](최신 라운드),
//            topic: TopicView|null(선택), design: DesignView|null,
//            submission: SubmissionView|null(초안 우선, 없으면 최신 revision),
//            evaluation: EvaluationView|null, finalizePreview: FinalizePreview|null,
//            final: ActivityFields|null, handoff: HandoffView|null }
//      finalizePreview 는 평가된 작성본에서 7항목을 뽑는다.
//
//   400 INVALID_QUERY
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND   (없는 세션과 남의 세션을 같은 응답으로 묶는다)
//   405 METHOD_NOT_ALLOWED / 500 INTERNAL
//
// 소유자 격리: service_role 로 읽으므로 모든 쿼리에 profile_id = userId 를 건다.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 조립 규칙은 _lib/inquiry/views.ts 의
// 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { asGradeLabel } from "../_lib/inquiry/bootstrap.js";
import {
  fail,
  hasInquiryAccess,
  loadHandoffView,
  loadSessionParts,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import {
  type Db,
  listArchivedSessions,
  listCompletedSessions,
  loadDraftSubmission,
  loadLatestRoundTopics,
  loadLatestSubmission,
  loadOpenSession,
  loadPlanItem,
  loadReport,
  loadReportsByIds,
  loadSession,
  loadSubmission,
  loadTopic,
  loadTopicsByIds,
} from "../_lib/inquiry/db.js";
import { parseReportsQuery } from "../_lib/inquiry/requests.js";
import { stageLabel, stageOf } from "../_lib/inquiry/stage.js";
import type { ActivityFields } from "../_lib/inquiry/types.js";
import {
  buildFinalizePreview,
  type DesignView,
  type EvaluationView,
  type FinalizePreview,
  type OpenItem,
  primaryAssetOf,
  primaryReliability,
  type SessionRow,
  toArchivedItem,
  toDesignView,
  toEvaluationView,
  toOpenItem,
  toReportsListItem,
  toSessionView,
  toSubmissionView,
  toTopicView,
} from "../_lib/inquiry/views.js";

async function handleList(res: VercelResponse, db: Db, userId: string) {
  const [completed, archived, openRow] = await Promise.all([
    listCompletedSessions(db, userId),
    listArchivedSessions(db, userId),
    loadOpenSession(db, userId),
  ]);

  const rows = [...completed, ...archived, ...(openRow ? [openRow] : [])];
  const topicIds = [
    ...new Set(
      rows.flatMap((r) => (r.selected_topic_id ? [r.selected_topic_id] : [])),
    ),
  ];
  const evaluationIds = completed.flatMap((r) =>
    r.latest_evaluation_id ? [r.latest_evaluation_id] : [],
  );
  const [topics, evaluations] = await Promise.all([
    loadTopicsByIds(db, userId, topicIds),
    loadReportsByIds(db, userId, evaluationIds),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const evaluationById = new Map(evaluations.map((e) => [e.id, e]));
  const titleOf = (row: SessionRow): string | null => {
    const topic = row.selected_topic_id
      ? topicById.get(row.selected_topic_id)
      : undefined;
    return topic ? toTopicView(topic).detail.title : null;
  };

  const items = completed.flatMap((row) => {
    const item = toReportsListItem(
      row,
      row.selected_topic_id
        ? (topicById.get(row.selected_topic_id) ?? null)
        : null,
      row.latest_evaluation_id
        ? (evaluationById.get(row.latest_evaluation_id) ?? null)
        : null,
    );
    if (!item) {
      console.error("inquiry/reports 완료 세션 요약 불가(건너뜀):", row.id);
      return [];
    }
    return [item];
  });

  let open: OpenItem | null = null;
  if (openRow) {
    const [roundTopics, draft] = await Promise.all([
      loadLatestRoundTopics(db, userId, openRow.id),
      loadDraftSubmission(db, userId, openRow.id),
    ]);
    const { currentStep } = toSessionView(openRow, {
      hasTopics: roundTopics.length > 0,
      hasSubmissionDraft: draft !== null,
    });
    open = toOpenItem(openRow, currentStep, titleOf(openRow));
  }

  res.status(200).json({
    ok: true,
    items,
    open,
    archived: archived.map((row) => toArchivedItem(row, titleOf(row))),
  });
}

async function handleDetail(
  res: VercelResponse,
  db: Db,
  userId: string,
  sessionId: string,
  nowIso: string,
) {
  const row = await loadSession(db, userId, sessionId);
  if (!row) {
    fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
    return;
  }
  const { session, assets, topics, draft } = await loadSessionParts(
    db,
    userId,
    row,
  );

  const topicRow = row.selected_topic_id
    ? await loadTopic(db, userId, row.selected_topic_id)
    : null;
  const topic = topicRow ? toTopicView(topicRow) : null;
  const primary = primaryAssetOf(assets);
  const planItem = row.plan_item_id
    ? await loadPlanItem(db, userId, row.plan_item_id)
    : null;

  let design: DesignView | null = null;
  if (row.design_report_id && topic) {
    const report = await loadReport(db, userId, row.design_report_id);
    const grade = asGradeLabel(row.grade_label);
    if (report && !grade) {
      throw new Error(`inquiry_sessions ${row.id}: grade_label 이 없습니다.`);
    }
    if (report && grade) {
      design = toDesignView(report, {
        topic,
        primaryAsset: primary,
        reliability: primaryReliability(assets),
        planItemTitle: planItem?.title ?? null,
        stageLabel: stageLabel(stageOf(grade)),
      });
    }
  }

  const submissionRow =
    draft ?? (await loadLatestSubmission(db, userId, row.id));
  const submission = submissionRow ? toSubmissionView(submissionRow) : null;

  let evaluation: EvaluationView | null = null;
  let finalizePreview: FinalizePreview | null = null;
  if (row.latest_evaluation_id) {
    const report = await loadReport(db, userId, row.latest_evaluation_id);
    const evaluated = report?.submission_id
      ? await loadSubmission(db, userId, report.submission_id)
      : null;
    if (report && evaluated) {
      evaluation = toEvaluationView(report, evaluated.revision);
      if (topic) {
        finalizePreview = buildFinalizePreview({
          topic,
          subject: row.subject,
          primaryAsset: primary,
          evaluation,
          planItemTitle: planItem?.title ?? null,
          submissionSections: toSubmissionView(evaluated).sections,
          concepts: topic.detail.concepts,
        });
      }
    }
  }

  const finalReport = row.final_report_id
    ? await loadReport(db, userId, row.final_report_id)
    : null;

  res.status(200).json({
    ok: true,
    session,
    assets,
    topics,
    topic,
    design,
    submission,
    evaluation,
    finalizePreview,
    final: finalReport ? (finalReport.sections as ActivityFields) : null,
    handoff: await loadHandoffView(db, userId, {
      grade: row.grade_label,
      subject: row.subject,
      nowIso,
    }),
  });
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "심화탐구 리포트를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/reports",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const query = parseReportsQuery(req.query ?? {});
    if (!query.ok) {
      fail(res, 400, "INVALID_QUERY", query.reason);
      return;
    }
    if (!(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }
    if (query.sessionId === undefined) {
      await handleList(res, db, userId);
      return;
    }
    await handleDetail(
      res,
      db,
      userId,
      query.sessionId,
      new Date().toISOString(),
    );
  },
});

export const config = { runtime: "nodejs" };
