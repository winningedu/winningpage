// api/growth/report 가 쓰는 얇은 DB 계층. 판단 로직은 reportBody, stepState, context 에 있다.

import { type Db, must, mustHave } from "../intake/collectDb.js";
import type { ValidationIssue } from "../validation.js";
import type { CarriedItem, CompletionPayload } from "./assemble.js";
import {
  type ActivityRecordRow,
  type AdmissionRow,
  buildReportContext,
  type PreviousReportRow,
  type ReportRow,
  type StudentProfileRow,
  universityTargets,
} from "./context.js";
import {
  interpretTerminate,
  type StoredRow,
  type TerminateOutcome,
} from "./reportBody.js";
import { interpretClaim } from "./stepState.js";
import type { ClaimResult, ReportContext, StepNumber } from "./types.js";

const REPORT_COLUMNS =
  "id, profile_id, status, current_step, track, survey_answers, activity_ids, grade_inputs, narrative_theme, grade_subthemes, stage, axis_scores, consistency, sections, signals, step_state, ledger_id, ledger_reversed_at, created_at";

export type ReportDbRow = ReportRow &
  StoredRow & {
    status: "draft" | "in_progress" | "completed" | "archived";
    current_step: number;
    ledger_id: string | null;
    ledger_reversed_at: string | null;
  };

export async function loadReportRow(
  db: Db,
  userId: string,
  reportId: string,
): Promise<ReportDbRow | null> {
  const data = must(
    await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("id", reportId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "growth_reports 조회 실패",
  );
  return (data as ReportDbRow | null) ?? null;
}

const ACTIVITY_COLUMNS =
  "id, source_program, status, grade_label, semester, subject_group, subject, topic, concept, method, result, limitation";

/** 직전 완료 회차(issued_at 최신 1건). */
async function loadPreviousCompleted(db: Db, userId: string) {
  const rows = must(
    await db
      .from("growth_reports")
      .select("id, narrative_theme, issued_at, survey_answers")
      .eq("profile_id", userId)
      .eq("status", "completed")
      .not("issued_at", "is", null)
      .order("issued_at", { ascending: false })
      .limit(1),
    "직전 회차 조회 실패",
  ) as {
    id: string;
    narrative_theme: string | null;
    issued_at: string;
    survey_answers: unknown;
  }[];
  return rows[0] ?? null;
}

export async function loadPreviousReportId(
  db: Db,
  userId: string,
): Promise<string | null> {
  return (await loadPreviousCompleted(db, userId))?.id ?? null;
}

export async function loadContextInputs(
  db: Db,
  userId: string,
  row: ReportDbRow,
  nowIso: string,
): Promise<ReportContext> {
  const activities =
    row.activity_ids.length === 0
      ? []
      : (must(
          await db
            .from("activity_records")
            .select(ACTIVITY_COLUMNS)
            .eq("profile_id", userId)
            .in("id", row.activity_ids),
          "activity_records 조회 실패",
        ) as ActivityRecordRow[]);
  const profile = must(
    await db
      .from("student_profiles")
      .select(
        "school_type, admission_year, grade, semester, career, department, universities",
      )
      .eq("profile_id", userId)
      .maybeSingle(),
    "student_profiles 조회 실패",
  ) as StudentProfileRow | null;

  const survey =
    typeof row.survey_answers === "object" &&
    row.survey_answers !== null &&
    !Array.isArray(row.survey_answers)
      ? (row.survey_answers as Record<string, unknown>)
      : {};
  const targets = universityTargets(survey, profile);
  const universityNames = targets.map((t) => t.universityName);
  const departmentNames = [
    ...new Set(
      targets
        .map((t) => t.departmentName)
        .filter((n): n is string => n !== null),
    ),
  ];
  const admissionRows =
    universityNames.length === 0 || departmentNames.length === 0
      ? []
      : (must(
          await db
            .from("admission_results")
            .select(
              "university_name, department_name, result_year, main_track, grade_avg",
            )
            .in("university_name", universityNames)
            .in("department_name", departmentNames)
            .eq("is_active", true),
          "admission_results 조회 실패",
        ) as AdmissionRow[]);

  const prev = await loadPreviousCompleted(db, userId);
  const previousReport: PreviousReportRow | null = prev
    ? {
        narrative_theme: prev.narrative_theme,
        issued_at: prev.issued_at,
        survey_answers: prev.survey_answers,
      }
    : null;

  return buildReportContext({
    report: row,
    activities,
    profile,
    admissionRows,
    previousReport,
    nowIso,
  });
}

export async function loadCarried(
  db: Db,
  userId: string,
  previousReportId: string | null,
): Promise<CarriedItem[]> {
  if (previousReportId === null) return [];
  return must(
    await db
      .from("growth_plan_items")
      .select(
        "id, report_id, program, title, description, priority, axis, category, period, period_label, deadline",
      )
      .eq("profile_id", userId)
      .eq("report_id", previousReportId)
      .eq("status", "pending")
      .order("sort_order", { ascending: true }),
    "growth_plan_items 조회 실패",
  ) as CarriedItem[];
}

export async function claimStep(
  db: Db,
  userId: string,
  reportId: string,
  step: StepNumber,
): Promise<ClaimResult> {
  return interpretClaim(
    must(
      await db.rpc("fn_growth_claim_step", {
        p_report_id: reportId,
        p_profile_id: userId,
        p_step: step,
      }),
      "fn_growth_claim_step 실패",
    ),
  );
}

/** 선점한 단계를 닫는다. 선점이 다른 요청에 넘어갔으면 false. */
export async function finishStep(
  db: Db,
  userId: string,
  reportId: string,
  step: StepNumber,
  ok: boolean,
  patch: Record<string, unknown>,
  issues: ValidationIssue[],
  extraAttempts: number,
): Promise<boolean> {
  const result = must(
    await db.rpc("fn_growth_finish_step", {
      p_report_id: reportId,
      p_profile_id: userId,
      p_step: step,
      p_ok: ok,
      p_patch: patch,
      p_issues: issues,
      p_extra_attempts: extraAttempts,
    }),
    "fn_growth_finish_step 실패",
  );
  return result === true;
}

export type CompleteOutcome = {
  ok: boolean;
  reason: string;
  issuedAt?: string;
  planItemCount?: number;
};

export async function completeReport(
  db: Db,
  userId: string,
  reportId: string,
  completion: CompletionPayload,
): Promise<CompleteOutcome> {
  const planItems = completion.planRows.map(
    ({ report_id: _r, profile_id: _p, ...rest }) => rest,
  );
  const raw = mustHave(
    must(
      await db.rpc("fn_growth_complete_report", {
        p_report_id: reportId,
        p_profile_id: userId,
        p_sections: completion.sections,
        p_plan_items: planItems,
        p_profile: completion.profile,
      }),
      "fn_growth_complete_report 실패",
    ),
    "fn_growth_complete_report",
  ) as Record<string, unknown>;
  return {
    ok: raw.ok === true,
    reason: typeof raw.reason === "string" ? raw.reason : "unknown",
    ...(typeof raw.issuedAt === "string" && { issuedAt: raw.issuedAt }),
    ...(typeof raw.planItemCount === "number" && {
      planItemCount: raw.planItemCount,
    }),
  };
}

export async function consumeCredit(
  db: Db,
  userId: string,
  reportId: string,
): Promise<{ status: string; charged: boolean }> {
  const raw = mustHave(
    must(
      await db.rpc("consume_growth_credit", {
        p_report_id: reportId,
        p_profile_id: userId,
      }),
      "consume_growth_credit 실패",
    ),
    "consume_growth_credit",
  ) as Record<string, unknown>;
  return {
    status: typeof raw.status === "string" ? raw.status : "unknown",
    charged: raw.charged === true,
  };
}

export async function reverseCredit(
  db: Db,
  userId: string,
  reportId: string,
): Promise<{ status: string; reversed: boolean }> {
  const raw = mustHave(
    must(
      await db.rpc("reverse_growth_credit", {
        p_report_id: reportId,
        p_profile_id: userId,
      }),
      "reverse_growth_credit 실패",
    ),
    "reverse_growth_credit",
  ) as Record<string, unknown>;
  return {
    status: typeof raw.status === "string" ? raw.status : "unknown",
    reversed: raw.reversed === true,
  };
}

/**
 * 회차를 archived 로 닫고 step_state.terminal 을 남긴다(fn_growth_terminate_report).
 * 차감을 되돌려야 하는지는 RPC 가 잠금 안에서 판단해 needsReverse 로 돌려준다.
 */
export async function terminateReportRpc(
  db: Db,
  userId: string,
  reportId: string,
  step: StepNumber,
  reason: string,
): Promise<TerminateOutcome> {
  return interpretTerminate(
    mustHave(
      must(
        await db.rpc("fn_growth_terminate_report", {
          p_report_id: reportId,
          p_profile_id: userId,
          p_step: step,
          p_reason: reason,
        }),
        "fn_growth_terminate_report 실패",
      ),
      "fn_growth_terminate_report",
    ),
  );
}
