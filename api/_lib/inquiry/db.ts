// 심화탐구 API 가 쓰는 DB 조회와 갱신. 핸들러에서 분리한 얇은 계층이다.
// service_role 로 읽고 쓰므로 모든 쿼리에 profile_id = userId 를 건다(소유자 격리).
// 판단과 변환은 전부 순수 함수(views, bootstrap, assets, submission)에 있고 여기엔 두지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionInfo } from "./bootstrap.js";
import type { GrowthReportRow, PlanItemRow } from "./growthHandoff.js";
import type { SubmissionSections } from "./types.js";
import type {
  AssetRow,
  RecordRow,
  ReportRow,
  SessionRow,
  SubmissionRow,
  TopicRow,
} from "./views.js";

export type Db = SupabaseClient;

const PG_UNIQUE_VIOLATION = "23505";

/** DB 오류를 던져 최상위 핸들러가 500 으로 처리하게 한다. */
export function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** 쓰기 직후 반환 행이 반드시 있어야 하는 호출용. 없으면 던진다. */
export function mustHave<T>(value: T, what: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${what}: 결과 없음`);
  }
  return value as NonNullable<T>;
}

const SESSION_COLUMNS =
  "id, status, grade_label, semester, career, subject, growth_report_id, plan_item_id, reply_pending, selected_topic_id, design_report_id, latest_evaluation_id, final_report_id, generation_state, topic_round_count, evaluation_count, last_activity_at, completed_at";
const ASSET_COLUMNS =
  "id, kind, reliability, position, activity_record_id, interview_answers, gaps, oneline_text";
const TOPIC_COLUMNS =
  "id, round, idx, link_kind, linkage_type, fit, selected, detail";
const SUBMISSION_COLUMNS =
  "id, revision, sections, char_counts, is_draft, updated_at";
const REPORT_COLUMNS =
  "id, report_type, topic_id, submission_id, sections, score, label, created_at";
const RECORD_COLUMNS =
  "id, source_program, status, grade_label, semester, subject_group, subject, topic, concept, limitation, confirmed_at, created_at";
const GROWTH_REPORT_COLUMNS =
  "id, status, issued_at, narrative_theme, grade_subthemes, stage, axis_scores, signals";
const PLAN_ITEM_COLUMNS =
  "id, program, status, title, description, category, axis";

// ── 세션 ────────────────────────────────────────────────────────────────────

/** 열린 세션(draft, in_progress). 학생당 1개 제약이 있어 최대 1건이다. */
export async function loadOpenSession(db: Db, userId: string) {
  return must(
    await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("profile_id", userId)
      .in("status", ["draft", "in_progress"])
      .maybeSingle(),
    "inquiry_sessions 조회 실패",
  ) as SessionRow | null;
}

export async function loadSession(db: Db, userId: string, sessionId: string) {
  return must(
    await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "inquiry_sessions 조회 실패",
  ) as SessionRow | null;
}

/** 새 세션. 열린 세션 유니크에 걸리면(동시 요청) null 을 돌려 호출부가 다시 조회하게 한다. */
export async function createSession(
  db: Db,
  userId: string,
  info: SessionInfo,
  growthReportId: string | null,
  nowIso: string,
): Promise<SessionRow | null> {
  const { data, error } = await db
    .from("inquiry_sessions")
    .insert({
      profile_id: userId,
      status: "draft",
      current_step: 1,
      grade_label: info.gradeLabel,
      semester: info.semester,
      career: info.career,
      subject: info.subject,
      growth_report_id: growthReportId,
      last_activity_at: nowIso,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) return null;
  if (error) throw new Error(`inquiry_sessions 생성 실패: ${error.message}`);
  return data as SessionRow;
}

export async function updateSessionInfo(
  db: Db,
  userId: string,
  sessionId: string,
  info: SessionInfo,
  nowIso: string,
) {
  return mustHave(
    must(
      await db
        .from("inquiry_sessions")
        .update({
          grade_label: info.gradeLabel,
          semester: info.semester,
          career: info.career,
          subject: info.subject,
          last_activity_at: nowIso,
        })
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .select(SESSION_COLUMNS)
        .maybeSingle(),
      "inquiry_sessions 갱신 실패",
    ),
    "inquiry_sessions 갱신",
  ) as SessionRow;
}

export async function touchSession(
  db: Db,
  userId: string,
  sessionId: string,
  nowIso: string,
) {
  must(
    await db
      .from("inquiry_sessions")
      .update({ last_activity_at: nowIso })
      .eq("id", sessionId)
      .eq("profile_id", userId),
    "inquiry_sessions 갱신 실패",
  );
}

/** 자산 저장 때 선택한 성장설계 과제와 마지막 활동 시각을 함께 갱신한다. */
export async function updatePlanItem(
  db: Db,
  userId: string,
  sessionId: string,
  planItemId: string | null,
  nowIso: string,
) {
  must(
    await db
      .from("inquiry_sessions")
      .update({ plan_item_id: planItemId, last_activity_at: nowIso })
      .eq("id", sessionId)
      .eq("profile_id", userId),
    "inquiry_sessions 과제 갱신 실패",
  );
}

export async function listCompletedSessions(db: Db, userId: string) {
  return must(
    await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("profile_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false }),
    "inquiry_sessions 조회 실패",
  ) as SessionRow[];
}

export async function listArchivedSessions(db: Db, userId: string) {
  return must(
    await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("profile_id", userId)
      .eq("status", "archived")
      .order("last_activity_at", { ascending: false }),
    "inquiry_sessions 조회 실패",
  ) as SessionRow[];
}

export async function loadReplyPendingSessions(db: Db, userId: string) {
  return must(
    await db
      .from("inquiry_sessions")
      .select("id, plan_item_id")
      .eq("profile_id", userId)
      .eq("reply_pending", true),
    "inquiry_sessions 조회 실패",
  ) as { id: string; plan_item_id: string | null }[];
}

export async function clearReplyPending(
  db: Db,
  userId: string,
  sessionId: string,
) {
  must(
    await db
      .from("inquiry_sessions")
      .update({ reply_pending: false })
      .eq("id", sessionId)
      .eq("profile_id", userId),
    "inquiry_sessions reply_pending 해제 실패",
  );
}

// ── 자산 ────────────────────────────────────────────────────────────────────

export async function loadAssets(db: Db, userId: string, sessionId: string) {
  return must(
    await db
      .from("inquiry_assets")
      .select(ASSET_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("position", { ascending: true }),
    "inquiry_assets 조회 실패",
  ) as AssetRow[];
}

export type NewAssetRow = {
  kind: "record" | "interview" | "oneline";
  reliability: "A" | "B" | "C";
  position: number;
  activity_record_id: string | null;
  interview_answers: unknown;
  gaps: string[] | null;
  oneline_text: string | null;
};

/** 세션의 자산을 통째로 바꾼다. (session_id, position) 유니크 때문에 지운 뒤 넣는다. */
export async function replaceAssets(
  db: Db,
  userId: string,
  sessionId: string,
  rows: NewAssetRow[],
) {
  must(
    await db
      .from("inquiry_assets")
      .delete()
      .eq("session_id", sessionId)
      .eq("profile_id", userId),
    "inquiry_assets 삭제 실패",
  );
  if (rows.length === 0) return [];
  return must(
    await db
      .from("inquiry_assets")
      .insert(
        rows.map((r) => ({ ...r, session_id: sessionId, profile_id: userId })),
      )
      .select(ASSET_COLUMNS)
      .order("position", { ascending: true }),
    "inquiry_assets 저장 실패",
  ) as AssetRow[];
}

// ── 주제 ────────────────────────────────────────────────────────────────────

/** 가장 최근 추천 라운드의 주제들(idx 순). 주제가 없으면 빈 배열. */
export async function loadLatestRoundTopics(
  db: Db,
  userId: string,
  sessionId: string,
) {
  const rows = must(
    await db
      .from("inquiry_topics")
      .select(TOPIC_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("round", { ascending: false })
      .order("idx", { ascending: true }),
    "inquiry_topics 조회 실패",
  ) as TopicRow[];
  const latest = rows[0]?.round;
  return rows.filter((r) => r.round === latest);
}

export async function loadTopic(db: Db, userId: string, topicId: string) {
  return must(
    await db
      .from("inquiry_topics")
      .select(TOPIC_COLUMNS)
      .eq("id", topicId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "inquiry_topics 조회 실패",
  ) as TopicRow | null;
}

export async function loadTopicsByIds(db: Db, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return must(
    await db
      .from("inquiry_topics")
      .select(TOPIC_COLUMNS)
      .eq("profile_id", userId)
      .in("id", ids),
    "inquiry_topics 조회 실패",
  ) as TopicRow[];
}

// ── 작성본 ──────────────────────────────────────────────────────────────────

export async function loadDraftSubmission(
  db: Db,
  userId: string,
  sessionId: string,
) {
  return must(
    await db
      .from("inquiry_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .eq("is_draft", true)
      .maybeSingle(),
    "inquiry_submissions 조회 실패",
  ) as SubmissionRow | null;
}

export async function loadLatestSubmission(
  db: Db,
  userId: string,
  sessionId: string,
) {
  return must(
    await db
      .from("inquiry_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "inquiry_submissions 조회 실패",
  ) as SubmissionRow | null;
}

export async function loadSubmission(
  db: Db,
  userId: string,
  submissionId: string,
) {
  return must(
    await db
      .from("inquiry_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("id", submissionId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "inquiry_submissions 조회 실패",
  ) as SubmissionRow | null;
}

async function maxRevision(db: Db, userId: string, sessionId: string) {
  const row = must(
    await db
      .from("inquiry_submissions")
      .select("revision")
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "inquiry_submissions revision 조회 실패",
  ) as { revision: number } | null;
  return row?.revision ?? 0;
}

async function updateDraft(
  db: Db,
  userId: string,
  draftId: string,
  sections: SubmissionSections,
  charCounts: Record<string, number>,
) {
  return mustHave(
    must(
      await db
        .from("inquiry_submissions")
        .update({ sections, char_counts: charCounts })
        .eq("id", draftId)
        .eq("profile_id", userId)
        .eq("is_draft", true)
        .select(SUBMISSION_COLUMNS)
        .maybeSingle(),
      "inquiry_submissions 갱신 실패",
    ),
    "inquiry_submissions 갱신",
  ) as SubmissionRow;
}

/** 초안이 있으면 덮어쓰고 없으면 revision = max + 1 로 새 초안을 넣는다. */
export async function upsertDraftSubmission(
  db: Db,
  userId: string,
  sessionId: string,
  sections: SubmissionSections,
  charCounts: Record<string, number>,
): Promise<SubmissionRow> {
  const draft = await loadDraftSubmission(db, userId, sessionId);
  if (draft) return updateDraft(db, userId, draft.id, sections, charCounts);

  const revision = (await maxRevision(db, userId, sessionId)) + 1;
  const { data, error } = await db
    .from("inquiry_submissions")
    .insert({
      session_id: sessionId,
      profile_id: userId,
      revision,
      sections,
      char_counts: charCounts,
      is_draft: true,
    })
    .select(SUBMISSION_COLUMNS)
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) {
    // 동시 요청이 먼저 초안을 만들었다. 그 초안을 덮어쓴다.
    const raced = mustHave(
      await loadDraftSubmission(db, userId, sessionId),
      "inquiry_submissions 초안",
    );
    return updateDraft(db, userId, raced.id, sections, charCounts);
  }
  if (error) throw new Error(`inquiry_submissions 저장 실패: ${error.message}`);
  return data as SubmissionRow;
}

// ── 리포트 ──────────────────────────────────────────────────────────────────

export async function loadReport(db: Db, userId: string, reportId: string) {
  return must(
    await db
      .from("inquiry_reports")
      .select(REPORT_COLUMNS)
      .eq("id", reportId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "inquiry_reports 조회 실패",
  ) as ReportRow | null;
}

export async function loadDesignReport(
  db: Db,
  userId: string,
  sessionId: string,
) {
  return must(
    await db
      .from("inquiry_reports")
      .select(REPORT_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .eq("report_type", "design")
      .maybeSingle(),
    "inquiry_reports 조회 실패",
  ) as ReportRow | null;
}

export async function loadReportsByIds(db: Db, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return must(
    await db
      .from("inquiry_reports")
      .select(REPORT_COLUMNS)
      .eq("profile_id", userId)
      .in("id", ids),
    "inquiry_reports 조회 실패",
  ) as ReportRow[];
}

// ── 공용 테이블(활동 기록, 프로필, 성장설계) ────────────────────────────────

/** 출발 활동 후보 원본. planned 는 제외하고 필요한 컬럼만 읽는다. */
export async function loadRecordCandidates(db: Db, userId: string) {
  return must(
    await db
      .from("activity_records")
      .select(RECORD_COLUMNS)
      .eq("profile_id", userId)
      .neq("status", "planned"),
    "activity_records 조회 실패",
  ) as RecordRow[];
}

/** id 로 본인 활동 기록을 읽는다(planned 포함, 거르는 일은 호출부 몫). */
export async function loadRecordsByIds(db: Db, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return must(
    await db
      .from("activity_records")
      .select(RECORD_COLUMNS)
      .eq("profile_id", userId)
      .in("id", ids),
    "activity_records 조회 실패",
  ) as RecordRow[];
}

/** 세션을 확정해 적립된 활동 기록(source_program deep, source_ref_id 세션 id). */
export async function loadActivityRecordForSession(
  db: Db,
  userId: string,
  sessionId: string,
) {
  return must(
    await db
      .from("activity_records")
      .select("id")
      .eq("profile_id", userId)
      .eq("source_program", "deep")
      .eq("source_ref_id", sessionId)
      .maybeSingle(),
    "activity_records 조회 실패",
  ) as { id: string } | null;
}

/** 공용 프로필. 행이 없으면 null(폴백 값을 만들지 않는다). */
export async function loadStudentProfile(db: Db, userId: string) {
  return must(
    await db
      .from("student_profiles")
      .select("grade, semester, career")
      .eq("profile_id", userId)
      .maybeSingle(),
    "student_profiles 조회 실패",
  ) as {
    grade: string | null;
    semester: number | null;
    career: string | null;
  } | null;
}

export async function loadGrowthReports(db: Db, userId: string) {
  return must(
    await db
      .from("growth_reports")
      .select(GROWTH_REPORT_COLUMNS)
      .eq("profile_id", userId)
      .eq("status", "completed"),
    "growth_reports 조회 실패",
  ) as GrowthReportRow[];
}

export async function loadPendingDeepPlanItems(
  db: Db,
  userId: string,
  reportId: string,
) {
  return must(
    await db
      .from("growth_plan_items")
      .select(PLAN_ITEM_COLUMNS)
      .eq("profile_id", userId)
      .eq("report_id", reportId)
      .eq("program", "deep")
      .eq("status", "pending")
      .order("sort_order", { ascending: true }),
    "growth_plan_items 조회 실패",
  ) as PlanItemRow[];
}

/** 본인 과제 한 건(program, status 는 호출부가 판단한다). */
export async function loadPlanItem(db: Db, userId: string, itemId: string) {
  return must(
    await db
      .from("growth_plan_items")
      .select(PLAN_ITEM_COLUMNS)
      .eq("id", itemId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "growth_plan_items 조회 실패",
  ) as PlanItemRow | null;
}
