// api/selfeval 이 쓰는 얇은 DB 계층. 판단 로직은 sessionBody, pickBody, view, reply 에 있다.
// service_role 로 읽고 쓰므로 모든 쿼리에 profile_id 조건을 건다. 단위 테스트는 두지 않는다.

import { type Db, must, mustHave } from "../growth/intake/collectDb.js";
import {
  extractGrowthSnapshot,
  type GrowthReportRowLike,
  type PlanItemRowLike,
} from "./growth.js";
import type {
  ActivityRecordRow,
  ReportRow,
  SessionActivityRow,
  SessionListRow,
  SessionRow,
  StudentProfileRow,
} from "./rows.js";
import { type ClaimResult, interpretClaim } from "./session.js";
import type {
  ActivityRecordLike,
  Area,
  GrowthSnapshot,
  ModelStepKey,
  StepIssue,
} from "./types.js";
import type { SessionActivityWithRecord } from "./view.js";

export type { Db };

const PG_UNIQUE_VIOLATION = "23505";

const LIST_COLUMNS =
  "id, status, current_step, academic_year, semester, area, subject, activity_name, step_state, last_activity_at, completed_at";

const SESSION_ACTIVITY_COLUMNS =
  "activity_record_id, role, fit_score, fit_reasons, analysis, analysis_source";

const RECORD_COLUMNS =
  "id, source_program, status, grade_label, semester, subject_group, subject, topic, concept, method, result, limitation, numbers, sources, created_at";

const REPORT_COLUMNS =
  "id, session_id, report_type, revision, sections, char_count, score, mandatory_fixes, created_at";

// ---------------------------------------------------------------------------
// 변환
// ---------------------------------------------------------------------------

export function toActivityLike(row: ActivityRecordRow): ActivityRecordLike {
  return {
    id: row.id,
    sourceProgram: row.source_program,
    status: row.status,
    gradeLabel: row.grade_label,
    semester: row.semester,
    subjectGroup: row.subject_group,
    subject: row.subject,
    topic: row.topic,
    concept: row.concept,
    method: row.method,
    result: row.result,
    limitation: row.limitation,
    numbers: row.numbers,
    sources: row.sources,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// 세션
// ---------------------------------------------------------------------------

export async function loadSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  return must(
    await db
      .from("selfeval_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "selfeval_sessions 조회 실패",
  ) as SessionRow | null;
}

/** 미완 세션(draft, in_progress). 학생당 1개만 허용되는 제약이 있다. */
export async function loadOpenSession(
  db: Db,
  userId: string,
): Promise<SessionRow | null> {
  return must(
    await db
      .from("selfeval_sessions")
      .select("*")
      .eq("profile_id", userId)
      .in("status", ["draft", "in_progress"])
      .maybeSingle(),
    "selfeval_sessions 조회 실패",
  ) as SessionRow | null;
}

export async function listSessions(
  db: Db,
  userId: string,
): Promise<SessionListRow[]> {
  return must(
    await db
      .from("selfeval_sessions")
      .select(LIST_COLUMNS)
      .eq("profile_id", userId)
      .order("last_activity_at", { ascending: false }),
    "selfeval_sessions 목록 조회 실패",
  ) as SessionListRow[];
}

export async function insertSession(
  db: Db,
  row: Record<string, unknown>,
): Promise<
  { ok: true; session: SessionRow } | { ok: false; code: "OPEN_EXISTS" }
> {
  const { data, error } = await db
    .from("selfeval_sessions")
    .insert(row)
    .select("*")
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) {
    return { ok: false, code: "OPEN_EXISTS" };
  }
  if (error) throw new Error(`selfeval_sessions 생성 실패: ${error.message}`);
  return { ok: true, session: data as SessionRow };
}

export async function updateSession(
  db: Db,
  userId: string,
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<SessionRow> {
  return mustHave(
    must(
      await db
        .from("selfeval_sessions")
        .update(patch)
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .select("*")
        .maybeSingle(),
      "selfeval_sessions 갱신 실패",
    ) as SessionRow | null,
    "selfeval_sessions 갱신",
  );
}

/** 완료 세션 중 성장설계 회신이 남은 것. 다음 진입 때 다시 보낸다. */
export async function loadSessionsWithReplyPending(
  db: Db,
  userId: string,
): Promise<Pick<SessionRow, "id" | "status" | "reply_pending">[]> {
  return must(
    await db
      .from("selfeval_sessions")
      .select("id, status, reply_pending")
      .eq("profile_id", userId)
      .eq("status", "completed")
      .not("reply_pending", "is", null),
    "selfeval_sessions 회신 대기 조회 실패",
  ) as Pick<SessionRow, "id" | "status" | "reply_pending">[];
}

// ---------------------------------------------------------------------------
// 세션 활동
// ---------------------------------------------------------------------------

/** 세션 활동과 연결된 activity_records 7항목을 두 번 조회해 합친다. 핵심 활동이 먼저 온다. */
export async function loadSessionActivities(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<SessionActivityWithRecord[]> {
  const rows = must(
    await db
      .from("selfeval_session_activities")
      .select(SESSION_ACTIVITY_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("role", { ascending: true }),
    "selfeval_session_activities 조회 실패",
  ) as SessionActivityRow[];
  if (rows.length === 0) return [];
  const records = must(
    await db
      .from("activity_records")
      .select(RECORD_COLUMNS)
      .eq("profile_id", userId)
      .in(
        "id",
        rows.map((r) => r.activity_record_id),
      ),
    "activity_records 조회 실패",
  ) as ActivityRecordRow[];
  const byId = new Map(records.map((r) => [r.id, toActivityLike(r)]));
  return rows.map((r) => ({
    ...r,
    record: mustHave(byId.get(r.activity_record_id), "연결된 활동 기록"),
  }));
}

export async function replaceSessionActivities(
  db: Db,
  userId: string,
  sessionId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  must(
    await db
      .from("selfeval_session_activities")
      .delete()
      .eq("session_id", sessionId)
      .eq("profile_id", userId),
    "selfeval_session_activities 삭제 실패",
  );
  if (rows.length === 0) return;
  must(
    await db.from("selfeval_session_activities").insert(rows),
    "selfeval_session_activities 저장 실패",
  );
}

// ---------------------------------------------------------------------------
// 리포트
// ---------------------------------------------------------------------------

export async function loadReports(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<ReportRow[]> {
  return must(
    await db
      .from("selfeval_reports")
      .select(REPORT_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
    "selfeval_reports 조회 실패",
  ) as ReportRow[];
}

export type ReportScoreRow = Pick<
  ReportRow,
  "session_id" | "report_type" | "revision" | "score"
>;

/** 목록 점수용. 여러 세션의 final, verification 리포트를 한 번의 in 쿼리로 읽는다. */
export async function loadLatestReportsByType(
  db: Db,
  userId: string,
  sessionIds: string[],
): Promise<ReportScoreRow[]> {
  if (sessionIds.length === 0) return [];
  return must(
    await db
      .from("selfeval_reports")
      .select("session_id, report_type, revision, score")
      .eq("profile_id", userId)
      .in("session_id", sessionIds)
      .in("report_type", ["final", "verification"]),
    "selfeval_reports 점수 조회 실패",
  ) as ReportScoreRow[];
}

// ---------------------------------------------------------------------------
// 활동 기록
// ---------------------------------------------------------------------------

/** 자기평가서가 만든 기록(self)은 재료가 아니라 제외한다. planned 도 상태와 함께 돌려준다. */
export async function loadActivityRecords(
  db: Db,
  userId: string,
): Promise<ActivityRecordLike[]> {
  const rows = must(
    await db
      .from("activity_records")
      .select(RECORD_COLUMNS)
      .eq("profile_id", userId)
      .neq("source_program", "self"),
    "activity_records 조회 실패",
  ) as ActivityRecordRow[];
  return rows.map(toActivityLike);
}

export async function countActivities(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from("activity_records")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .neq("source_program", "self")
    .neq("status", "planned");
  if (error)
    throw new Error(`activity_records 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}

/** 같은 영역과 같은 과목(교과) 또는 활동명(창체)으로 완료한 세션이 쓴 활동 id. */
export async function loadUsedActivityIds(
  db: Db,
  userId: string,
  area: Area,
  subjectOrName: string,
): Promise<Set<string>> {
  const column = area === "subject" ? "subject" : "activity_name";
  const sessions = must(
    await db
      .from("selfeval_sessions")
      .select("id")
      .eq("profile_id", userId)
      .eq("status", "completed")
      .eq("area", area)
      .eq(column, subjectOrName),
    "selfeval_sessions 사용 이력 조회 실패",
  ) as { id: string }[];
  if (sessions.length === 0) return new Set();
  const used = must(
    await db
      .from("selfeval_session_activities")
      .select("activity_record_id")
      .eq("profile_id", userId)
      .in(
        "session_id",
        sessions.map((s) => s.id),
      ),
    "selfeval_session_activities 사용 이력 조회 실패",
  ) as { activity_record_id: string }[];
  return new Set(used.map((u) => u.activity_record_id));
}

export async function insertManualActivity(
  db: Db,
  row: Record<string, unknown>,
): Promise<string> {
  const data = must(
    await db.from("activity_records").insert(row).select("id").single(),
    "activity_records 직접 입력 저장 실패",
  ) as { id: string };
  return data.id;
}

// ---------------------------------------------------------------------------
// 성장설계와 프로필
// ---------------------------------------------------------------------------

const GROWTH_COLUMNS =
  "id, issued_at, narrative_theme, grade_subthemes, stage, axis_scores, signals";

const PLAN_COLUMNS = "id, title, description, axis, category, program, status";

/** 발행된 완료 회차 중 가장 최근 1건과 그 회차의 자기평가서용 대기 계획 항목. 없으면 null. */
export async function loadLatestGrowth(
  db: Db,
  userId: string,
): Promise<{
  report: GrowthReportRowLike;
  planItems: PlanItemRowLike[];
} | null> {
  const report = must(
    await db
      .from("growth_reports")
      .select(GROWTH_COLUMNS)
      .eq("profile_id", userId)
      .eq("status", "completed")
      .not("issued_at", "is", null)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "growth_reports 조회 실패",
  ) as GrowthReportRowLike | null;
  if (report === null) return null;
  const planItems = must(
    await db
      .from("growth_plan_items")
      .select(PLAN_COLUMNS)
      .eq("profile_id", userId)
      .eq("report_id", report.id)
      .eq("program", "self")
      .eq("status", "pending")
      .order("sort_order", { ascending: true }),
    "growth_plan_items 조회 실패",
  ) as PlanItemRowLike[];
  return { report, planItems };
}

export async function loadGrowthSnapshot(
  db: Db,
  userId: string,
): Promise<GrowthSnapshot | null> {
  const latest = await loadLatestGrowth(db, userId);
  return latest === null
    ? null
    : extractGrowthSnapshot(latest.report, latest.planItems);
}

export async function loadStudentProfile(
  db: Db,
  userId: string,
): Promise<StudentProfileRow | null> {
  return must(
    await db
      .from("student_profiles")
      .select("grade, semester, career, department, universities")
      .eq("profile_id", userId)
      .maybeSingle(),
    "student_profiles 조회 실패",
  ) as StudentProfileRow | null;
}

// ---------------------------------------------------------------------------
// RPC 래퍼. 정본 전이는 DB 함수가 한다.
// ---------------------------------------------------------------------------

function rpcData<T>(
  result: { data: T; error: { message: string } | null },
  name: string,
): T {
  return must(result, `${name} 호출 실패`);
}

export type TerminateResult =
  | { ok: true; needsReverse: boolean; ledgerId: string | null }
  | { ok: false; reason: "not_found" | "not_open" };

export async function terminateSession(
  db: Db,
  userId: string,
  sessionId: string,
  step: ModelStepKey | null,
  reason: string,
): Promise<TerminateResult> {
  const data = rpcData(
    await db.rpc("fn_selfeval_terminate_session", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_step: step,
      p_reason: reason,
    }),
    "fn_selfeval_terminate_session",
  ) as Record<string, unknown>;
  if (data.ok === true) {
    return {
      ok: true,
      needsReverse: data.needsReverse === true,
      ledgerId: typeof data.ledgerId === "string" ? data.ledgerId : null,
    };
  }
  return {
    ok: false,
    reason: data.reason === "not_found" ? "not_found" : "not_open",
  };
}

export async function reverseCredit(
  db: Db,
  userId: string,
  sessionId: string,
  reason: string,
): Promise<unknown> {
  return rpcData(
    await db.rpc("reverse_selfeval_credit", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_reason: reason,
    }),
    "reverse_selfeval_credit",
  );
}

export async function consumeCredit(
  db: Db,
  userId: string,
  sessionId: string,
  reason: string,
): Promise<unknown> {
  return rpcData(
    await db.rpc("consume_selfeval_credit", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_reason: reason,
    }),
    "consume_selfeval_credit",
  );
}

export async function claimStep(
  db: Db,
  userId: string,
  sessionId: string,
  step: ModelStepKey,
  staleSeconds: number,
): Promise<ClaimResult> {
  return interpretClaim(
    rpcData(
      await db.rpc("fn_selfeval_claim_step", {
        p_session_id: sessionId,
        p_profile_id: userId,
        p_step: step,
        p_stale_seconds: staleSeconds,
      }),
      "fn_selfeval_claim_step",
    ),
  );
}

export async function finishStep(
  db: Db,
  userId: string,
  sessionId: string,
  step: ModelStepKey,
  args: {
    ok: boolean;
    patch?: Record<string, unknown>;
    issues?: StepIssue[];
    extraAttempts?: number;
  },
): Promise<boolean> {
  return rpcData(
    await db.rpc("fn_selfeval_finish_step", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_step: step,
      p_ok: args.ok,
      p_patch: args.patch ?? {},
      p_issues: args.issues ?? [],
      p_extra_attempts: args.extraAttempts ?? 0,
    }),
    "fn_selfeval_finish_step",
  ) as boolean;
}

export async function finalizeSession(
  db: Db,
  userId: string,
  sessionId: string,
  args: {
    promoted: Record<string, unknown>;
    sections: unknown;
    charCount: unknown;
    score: number;
  },
): Promise<unknown> {
  return rpcData(
    await db.rpc("fn_selfeval_finalize", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_promoted: args.promoted,
      p_sections: args.sections,
      p_char_count: args.charCount,
      p_score: args.score,
    }),
    "fn_selfeval_finalize",
  );
}
