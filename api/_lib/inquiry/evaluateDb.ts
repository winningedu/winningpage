// 평가, 확정, 만료 보관이 쓰는 DB 호출(부록 B 3~5번). 판단은 evaluateFlow, finalizeFlow 에 있다.
// db.ts 와 같은 규칙으로 service_role 에 소유자 조건(profile_id)을 건다.

import { type Db, must, mustHave } from "./db.js";
import type { EvaluationReportInsert } from "./evaluateFlow.js";
import type { ActivityFields } from "./types.js";
import type { ReportRow, SubmissionRow } from "./views.js";

const SUBMISSION_COLUMNS =
  "id, revision, sections, char_counts, is_draft, updated_at";
const REPORT_COLUMNS =
  "id, report_type, topic_id, submission_id, sections, score, label, created_at";

/** 초안을 평가용 확정본으로 바꾼다(is_draft false, 제출 시각). 이미 확정됐으면 던진다. */
export async function finalizeDraftSubmission(
  db: Db,
  userId: string,
  submissionId: string,
  nowIso: string,
): Promise<SubmissionRow> {
  return mustHave(
    must(
      await db
        .from("inquiry_submissions")
        .update({ is_draft: false, submitted_at: nowIso })
        .eq("id", submissionId)
        .eq("profile_id", userId)
        .eq("is_draft", true)
        .select(SUBMISSION_COLUMNS)
        .maybeSingle(),
      "inquiry_submissions 확정 실패",
    ),
    "inquiry_submissions 확정",
  ) as SubmissionRow;
}

export async function insertEvaluationReport(
  db: Db,
  row: EvaluationReportInsert,
): Promise<ReportRow> {
  return mustHave(
    must(
      await db
        .from("inquiry_reports")
        .insert(row)
        .select(REPORT_COLUMNS)
        .single(),
      "inquiry_reports 평가 저장 실패",
    ),
    "inquiry_reports 평가 저장",
  ) as ReportRow;
}

/** 평가 성공 뒤 세션 포인터. evaluationCount 는 새 값(이전 + 1)이다. */
export async function recordEvaluationOnSession(
  db: Db,
  userId: string,
  sessionId: string,
  input: { evaluationId: string; evaluationCount: number; nowIso: string },
) {
  must(
    await db
      .from("inquiry_sessions")
      .update({
        latest_evaluation_id: input.evaluationId,
        evaluation_count: input.evaluationCount,
        current_step: 5,
        last_activity_at: input.nowIso,
      })
      .eq("id", sessionId)
      .eq("profile_id", userId),
    "inquiry_sessions 평가 기록 실패",
  );
}

/** fn_inquiry_finalize 한 트랜잭션 호출. 반환 jsonb 를 해석하지 않고 그대로 돌려준다. */
export async function callFinalizeRpc(
  db: Db,
  sessionId: string,
  userId: string,
  fields: ActivityFields,
): Promise<unknown> {
  return must(
    await db.rpc("fn_inquiry_finalize", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_fields: fields,
    }),
    "fn_inquiry_finalize 실패",
  );
}

export async function setReplyPending(
  db: Db,
  userId: string,
  sessionId: string,
  value: boolean,
) {
  must(
    await db
      .from("inquiry_sessions")
      .update({ reply_pending: value })
      .eq("id", sessionId)
      .eq("profile_id", userId),
    "inquiry_sessions reply_pending 갱신 실패",
  );
}

/** 마지막 활동이 cutoff 이전인 열린 세션을 보관한다. 완료 세션은 건드리지 않는다. */
export async function archiveExpiredSessions(
  db: Db,
  cutoffIso: string,
): Promise<string[]> {
  const data = must(
    await db
      .from("inquiry_sessions")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("status", ["draft", "in_progress"])
      .lt("last_activity_at", cutoffIso)
      .select("id"),
    "inquiry_sessions 보관 실패",
  ) as { id: string }[] | null;
  return (data ?? []).map((row) => row.id);
}
