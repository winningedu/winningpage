// GET /api/performance/reports
// Authorization: Bearer <supabase access token>
//
// 수행평가 "저장 리포트" 화면(P12)의 조회 전용 엔드포인트다. 명세서 §8.6:1836이
// 규정한 두 조회를 하나의 GET 라우트로 묶는다 — 쿼리 파라미터로 모드를 가른다:
//
//   ① 목록 — `?cursor=<updated_at ISO>&limit=<n>`(둘 다 선택)
//      200 { items[{ sessionId, topicTitle, gradeLabel, subjectGroup, subject,
//             careerGoal, updatedAt, hasDesign, hasEvaluation, hasFinal,
//             designReportId, evaluationReportId, finalReportId }], nextCursor|null }
//   ② 상세 — `?sessionId=<uuid>`
//      200 { session{...}, design|null, evaluation|null, final|null, submissions[] }
//
//   401 { error:{code:'UNAUTHENTICATED'} } / 403 { error:{code:'NO_ENTITLEMENT'} }
//   403 { error:{code:'NOT_SESSION_OWNER'} } (상세, 없는 세션과 남의 세션을 같은
//        응답으로 묶는다 — design-report.js·finalize.js와 같은 관례)
//   400 INVALID_SESSION_ID / INVALID_CURSOR
//   405 METHOD_NOT_ALLOWED / 500 INTERNAL
//
// ── 뷰에 owner 컬럼이 없다 — 소유자 격리는 이 파일이 만든다
//    `sql/72_performance_saved_reports_view.sql`의 `v_performance_saved_reports`는
//    `security_invoker = true`이지만, 이 라우트는 service_role 클라이언트로 쿼리하므로
//    RLS 자체가 우회된다(§8.6 공통 규약 「소유자 격리는 `.eq('profile_id', userId)`가
//    유일한 방어선」, bootstrap.js와 동일). 뷰에는 session만 있고 profile_id가 없어
//    `.eq()`를 뷰에 직접 걸 수 없으므로, 목록 조회 전에 `performance_sessions`에서
//    이 사용자가 소유한 session_id만 먼저 뽑아 `.in('session_id', ids)`로 좁힌다.
//
// ── final_report_id는 performance_submissions가 아니라 performance_reports를 가리킨다
//    §8.6 문면과 달리, `finalize_performance_submission` RPC(sql/58 (5))가 최종 확정과
//    같은 트랜잭션에서 `report_type='final_submission'` 행을 만들고 그 `sections`가
//    `SectionedReportView`가 그대로 소비할 수 있는 봉투다(`finalize.js:290-311`).
//    `performance_submissions.id`는 원본 필드만 갖고 있어 섹션 렌더가 안 된다 — 그래서
//    design/evaluation과 대칭으로 performance_reports.id를 쓴다(뷰 파일 상단 주석 참고).
//
// ── 목록은 저장물이 있는 세션만 보여준다
//    STEP1만 채운 draft 세션(리포트 0건)까지 "저장 리포트"로 노출하면 빈 카드가
//    섞인다. `has_design/has_evaluation/has_final` 중 하나도 없는 행은 목록에서
//    제외한다. 재방문/이어하기 대상 세션은 `bootstrap.js`의 `lastSession`이 이미
//    별도로 책임진다 — 이 라우트와 역할이 겹치지 않는다.
//
// ── 상세는 리포트 3종 + 제출본 전체를 한 번에 반환한다
//    프론트가 `design`/`evaluation`/`final` 중 있는 것만 `SectionedReportView`에
//    넘기면 되도록 세 필드 모두 `sections` 배열을 갖는 동일한 모양으로 정규화한다
//    (design-report.js/evaluate.js/finalize.js의 `toClientReport` 관례와 동일).
//    `submissions`는 revision 오름차순 전체 배열이다 — 어느 리포트가 어느 제출본을
//    평가했는지는 `evaluation.submissionId`/`evaluation.revision`으로 프론트가
//    매칭한다(추가 조인 없이 봉투에 이미 들어있는 값, evaluate.js `buildReportEnvelope`).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Json } from "../../../src/types/database.types.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

const SERVICE_KEY = "suhaeng";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

const LIST_COLUMNS = [
  "session_id",
  "topic_title",
  "grade_label",
  "subject_group",
  "subject",
  "career_goal",
  "updated_at",
  "has_design",
  "has_evaluation",
  "has_final",
  "design_report_id",
  "evaluation_report_id",
  "final_report_id",
].join(",");

const SESSION_COLUMNS = [
  "id",
  "status",
  "grade_label",
  "semester",
  "subject_group",
  "subject",
  "career_goal",
  "selected_topic_id",
  "created_at",
  "updated_at",
].join(",");

const REPORT_COLUMNS =
  "id,report_type,topic_id,submission_id,sections,score,summary,model,prompt_version,created_at,updated_at";

const SUBMISSION_COLUMNS =
  "id,revision,fields,char_counts,is_draft,is_final,finalized_at,finalize_reason,submitted_at,created_at,updated_at";

type ListRow = {
  session_id: string;
  topic_title: string | null;
  grade_label: string | null;
  subject_group: string | null;
  subject: string | null;
  career_goal: string | null;
  updated_at: string;
  has_design: boolean;
  has_evaluation: boolean;
  has_final: boolean;
  design_report_id: string | null;
  evaluation_report_id: string | null;
  final_report_id: string | null;
};

type SessionRow = {
  id: string;
  status: string;
  grade_label: string | null;
  semester: string | null;
  subject_group: string | null;
  subject: string | null;
  career_goal: string | null;
  selected_topic_id: string | null;
  created_at: string;
  updated_at: string;
};

type ReportRow = {
  id: string;
  report_type: string;
  topic_id: string | null;
  submission_id: string | null;
  // jsonb 컬럼(생성 타입은 Json). 런타임에는 항상 객체 봉투를 담지만(위
  // 파일 주석의 finalize/design-report/evaluate 관례), toXReport()들은 이미
  // typeof 가드 뒤에서 Record<string, unknown>으로 다시 캐스트해 읽는다.
  sections: Json | null;
  score: number | null;
  summary: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
};

type SubmissionRow = {
  id: string;
  revision: number;
  fields: unknown;
  char_counts: unknown;
  is_draft: boolean;
  is_final: boolean;
  finalized_at: string | null;
  finalize_reason: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

function toListItem(row: ListRow) {
  return {
    sessionId: row.session_id,
    topicTitle: row.topic_title,
    gradeLabel: row.grade_label,
    subjectGroup: row.subject_group,
    subject: row.subject,
    careerGoal: row.career_goal,
    updatedAt: row.updated_at,
    hasDesign: row.has_design,
    hasEvaluation: row.has_evaluation,
    hasFinal: row.has_final,
    designReportId: row.design_report_id,
    evaluationReportId: row.evaluation_report_id,
    finalReportId: row.final_report_id,
  };
}

/** design-report.js `toClientReport`와 같은 봉투 모양(`{structure,sections,resources}`). */
function toDesignReport(row: ReportRow | null) {
  if (!row) return null;
  const envelope = (
    row.sections && typeof row.sections === "object" ? row.sections : {}
  ) as Record<string, unknown>;
  return {
    reportId: row.id,
    topicId: row.topic_id ?? null,
    structure: envelope.structure || null,
    sections: Array.isArray(envelope.sections) ? envelope.sections : [],
    resources: Array.isArray(envelope.resources) ? envelope.resources : [],
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** evaluate.js `toClientReport`와 같은 봉투 모양(`{score,summary,sections,structure}`). */
function toEvaluationReport(row: ReportRow | null) {
  if (!row) return null;
  const envelope = (
    row.sections && typeof row.sections === "object" ? row.sections : {}
  ) as Record<string, unknown>;
  return {
    reportId: row.id,
    submissionId: row.submission_id ?? envelope.submissionId ?? null,
    revision: envelope.revision ?? null,
    sections: Array.isArray(envelope.sections) ? envelope.sections : [],
    score: row.score ?? envelope.score ?? null,
    summary: row.summary ?? envelope.summary ?? "",
    structure: envelope.structure || null,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** finalize.js가 저장하는 봉투 모양(`{sections}` — 서버가 제출 필드로 조립, 모델 산출물 아님). */
function toFinalReport(row: ReportRow | null) {
  if (!row) return null;
  const envelope = (
    row.sections && typeof row.sections === "object" ? row.sections : {}
  ) as Record<string, unknown>;
  return {
    reportId: row.id,
    submissionId: row.submission_id ?? null,
    sections: Array.isArray(envelope.sections) ? envelope.sections : [],
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function toSubmission(row: SubmissionRow) {
  return {
    submissionId: row.id,
    revision: row.revision,
    fields: row.fields,
    charCounts: row.char_counts,
    isDraft: row.is_draft,
    isFinal: row.is_final,
    finalizedAt: row.finalized_at,
    finalizeReason: row.finalize_reason,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handleList(
  req: VercelRequest,
  res: VercelResponse,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
  const limit = Number.isInteger(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), LIST_LIMIT_MAX)
    : LIST_LIMIT_DEFAULT;

  const cursor =
    typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
  let cursorIso: string | null = null;
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return fail(res, 400, "INVALID_CURSOR", "cursor가 올바르지 않습니다.");
    }
    cursorIso = cursorDate.toISOString();
  }

  // ── 소유 세션 id 목록. 뷰에는 profile_id가 없어 여기서 좁힌 id 집합이 유일한
  //    소유자 격리 경계다(파일 상단 주석 참고).
  const { data: ownedSessions, error: ownedError } = await supabaseAdmin
    .from("performance_sessions")
    .select("id")
    .eq("profile_id", userId);

  if (ownedError) throw new Error(`세션 목록 조회 실패: ${ownedError.message}`);

  const ownedSessionIds = (ownedSessions || []).map((row) => row.id);
  if (!ownedSessionIds.length) {
    return res.status(200).json({ items: [], nextCursor: null });
  }

  let viewQuery = supabaseAdmin
    .from("v_performance_saved_reports")
    .select(LIST_COLUMNS)
    .in("session_id", ownedSessionIds)
    // 저장물이 하나도 없는 draft 세션은 "저장 리포트"가 아니다(파일 상단 주석).
    .or("has_design.eq.true,has_evaluation.eq.true,has_final.eq.true")
    .order("updated_at", { ascending: false })
    .limit(limit + 1);

  if (cursorIso) {
    viewQuery = viewQuery.lt("updated_at", cursorIso);
  }

  const { data: rows, error: viewError } = await viewQuery;
  if (viewError)
    throw new Error(`저장 리포트 목록 조회 실패: ${viewError.message}`);

  // `LIST_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반 열
  // 추론을 못 하고 `GenericStringError`로 떨어진다 — select 목록과 ListRow 필드는
  // 위 상수와 정확히 대응하므로 안전한 캐스트다.
  const pageRows = (rows || []) as unknown as ListRow[];
  const hasMore = pageRows.length > limit;
  const items = (hasMore ? pageRows.slice(0, limit) : pageRows).map(toListItem);
  // hasMore가 true면 slice(0, limit)로 최소 1개(limit>=1)가 남아 있다.
  const nextCursor = hasMore ? items[items.length - 1]!.updatedAt : null;

  return res.status(200).json({ items, nextCursor });
}

async function handleDetail(
  _req: VercelRequest,
  res: VercelResponse,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  sessionId: string,
) {
  if (!UUID_RE.test(sessionId)) {
    return fail(
      res,
      400,
      "INVALID_SESSION_ID",
      "sessionId가 올바르지 않습니다.",
    );
  }

  // ── 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶어 id 존재 여부가
  //    새지 않게 한다(design-report.js·finalize.js와 같은 관례).
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("performance_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);
  if (!sessionRow) {
    return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.");
  }

  // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반
  // 열 추론을 못 하고 `GenericStringError`로 떨어진다 — select 목록과 SessionRow
  // 필드는 위 상수와 정확히 대응하므로 안전한 캐스트다.
  const session = sessionRow as unknown as SessionRow;

  let topicTitle: string | null = null;
  if (session.selected_topic_id) {
    const { data: topicRow, error: topicError } = await supabaseAdmin
      .from("performance_topics")
      .select("title")
      .eq("id", session.selected_topic_id)
      .eq("session_id", session.id)
      .maybeSingle();

    if (topicError) throw new Error(`주제 조회 실패: ${topicError.message}`);
    topicTitle = topicRow?.title ?? null;
  }

  const { data: reportRows, error: reportsError } = await supabaseAdmin
    .from("performance_reports")
    .select(REPORT_COLUMNS)
    .eq("session_id", session.id);

  if (reportsError)
    throw new Error(`리포트 조회 실패: ${reportsError.message}`);

  const rows: ReportRow[] = reportRows || [];
  const designRow = rows.find((row) => row.report_type === "design") || null;
  const evaluationRow =
    rows.find((row) => row.report_type === "evaluation") || null;
  const finalRow =
    rows.find((row) => row.report_type === "final_submission") || null;

  const { data: submissionRows, error: submissionsError } = await supabaseAdmin
    .from("performance_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("session_id", session.id)
    .order("revision", { ascending: true });

  if (submissionsError)
    throw new Error(`제출본 조회 실패: ${submissionsError.message}`);

  return res.status(200).json({
    session: {
      sessionId: session.id,
      status: session.status,
      gradeLabel: session.grade_label,
      semester: session.semester,
      subjectGroup: session.subject_group,
      subject: session.subject,
      careerGoal: session.career_goal,
      topicId: session.selected_topic_id,
      topicTitle,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    design: toDesignReport(designRow),
    evaluation: toEvaluationReport(evaluationRow),
    final: toFinalReport(finalRow),
    submissions: ((submissionRows as SubmissionRow[]) || []).map(toSubmission),
  });
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "저장 리포트를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/reports",
  // 개인화된 저장 산출물 응답이다. 중간 캐시에 남으면 다른 사용자에게 새어 나갈 수
  // 있으므로 저장 자체를 금지한다(bootstrap.js와 동일).
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // ── 이용권 재판정. 클라이언트 가드 통과 여부는 신뢰하지 않는다(§8.6 공통 규약).
    const { allowed: hasAccess, reason: accessReason } =
      await hasPaidServiceAccess(
        supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      );
    if (!hasAccess) {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        tenantReasonExtra(accessReason),
      );
    }

    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";

    if (sessionId) {
      await handleDetail(req, res, supabaseAdmin, userId, sessionId);
      return;
    }

    await handleList(req, res, supabaseAdmin, userId);
  },
});

// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
export const config = { runtime: "nodejs" };
