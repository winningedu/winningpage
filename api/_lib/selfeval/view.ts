// selfeval 조회 API 응답 조립(명세 No.15~18, 65, 75, 계획서 §2 10~13).
// 순수 모듈이다. 핸들러는 db.ts 로 읽은 행을 여기에 넘기고 결과를 그대로 응답한다.

import type { QuotaSnapshot } from "../serviceAccess.js";
import { bannerSummary } from "./growth.js";
import type {
  ReportRow,
  SessionActivityRow,
  SessionListRow,
  SessionRow,
  StudentProfileRow,
} from "./rows.js";
import {
  currentAcademicYear,
  isGrowthStale,
  parseStepState,
  progress,
  routeForStep,
} from "./session.js";
import {
  type ActivityRecordLike,
  type CharCount,
  type GrowthSnapshot,
  type HighGrade,
  MAX_REGENERATIONS,
  type ReportType,
  type StepTerminal,
} from "./types.js";

const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// 목록
// ---------------------------------------------------------------------------

function terminalOf(stepState: unknown): StepTerminal | null {
  return parseStepState(stepState).terminal ?? null;
}

/** 세션별 목록 점수. 최종본(final)이 있으면 그 점수, 없으면 최신 검증(verification) 점수. */
export function latestScores(
  rows: Pick<ReportRow, "session_id" | "report_type" | "revision" | "score">[],
): Map<string, number | null> {
  const best = new Map<string, (typeof rows)[number]>();
  const rank = (r: (typeof rows)[number]) =>
    (r.report_type === "final" ? 1_000_000 : 0) + r.revision;
  for (const r of rows) {
    const prev = best.get(r.session_id);
    if (prev === undefined || rank(r) > rank(prev)) best.set(r.session_id, r);
  }
  return new Map([...best].map(([id, r]) => [id, r.score]));
}

export function listItem(row: SessionListRow, latestScore: number | null) {
  const terminal = terminalOf(row.step_state);
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    academicYear: row.academic_year,
    semester: row.semester,
    area: row.area,
    subject: row.subject,
    activityName: row.activity_name,
    score: latestScore,
    completedAt: row.completed_at,
    lastActivityAt: row.last_activity_at,
    // 종결 사유 없는 archived 는 크론이 사유를 남기기 전의 만료로 본다.
    expired:
      row.status === "archived" &&
      (terminal === null || terminal.reason === "expired"),
    discarded: terminal?.reason === "discarded",
    terminal:
      terminal === null ? null : { reason: terminal.reason, at: terminal.at },
  };
}

// ---------------------------------------------------------------------------
// 진입
// ---------------------------------------------------------------------------

export type EntryInput = {
  quota: QuotaSnapshot | null;
  allowed: boolean;
  activityCount: number;
  open: SessionListRow | null;
  growth: GrowthSnapshot | null;
  now: Date;
  profile: StudentProfileRow | null;
  replyResent: number;
};

function profileView(profile: StudentProfileRow) {
  return {
    gradeLabel: GRADES.includes(profile.grade as HighGrade)
      ? (profile.grade as HighGrade)
      : null,
    semester:
      profile.semester === 1 || profile.semester === 2
        ? profile.semester
        : null,
    career: profile.career,
    department: profile.department,
    universities: profile.universities,
  };
}

export function entryBody(input: EntryInput) {
  const profile = input.profile === null ? null : profileView(input.profile);
  const { open, growth } = input;
  return {
    quota: input.quota,
    allowed: input.allowed,
    activityCount: input.activityCount,
    openSession:
      open === null
        ? null
        : {
            id: open.id,
            status: open.status,
            currentStep: open.current_step,
            route: routeForStep(open.current_step),
            area: open.area,
            subject: open.subject,
            activityName: open.activity_name,
            lastActivityAt: open.last_activity_at,
          },
    growth:
      growth === null
        ? null
        : {
            reportId: growth.reportId,
            issuedAt: growth.issuedAt,
            stale: isGrowthStale(growth.issuedAt, input.now),
            banner: bannerSummary(growth, profile?.gradeLabel ?? undefined),
            planItems: growth.planItems,
          },
    profile,
    replyResent: input.replyResent,
    academicYearDefault: currentAcademicYear(input.now),
  };
}

// ---------------------------------------------------------------------------
// 상세
// ---------------------------------------------------------------------------

export type SessionActivityWithRecord = SessionActivityRow & {
  record: ActivityRecordLike;
};

export type ReportView = {
  id: string;
  revision: number;
  sections: unknown;
  charCount: CharCount | null;
  score: number | null;
  mandatoryFixes: unknown;
  createdAt: string;
};

function reportView(row: ReportRow): ReportView {
  return {
    id: row.id,
    revision: row.revision,
    sections: row.sections,
    charCount: (row.char_count as CharCount | null) ?? null,
    score: row.score,
    mandatoryFixes: row.mandatory_fixes,
    createdAt: row.created_at,
  };
}

function latestOf(rows: ReportRow[], type: ReportType): ReportRow | null {
  let best: ReportRow | null = null;
  for (const r of rows) {
    if (r.report_type !== type) continue;
    if (best === null || r.revision > best.revision) best = r;
  }
  return best;
}

/** 검증과 저장의 대상 본문. 생성본보다 늦게 만든 편집본이 있으면 편집본, 없으면 생성본. */
function currentOf(
  generation: ReportRow | null,
  edited: ReportRow | null,
): ReportRow | null {
  if (
    edited !== null &&
    (generation === null || edited.created_at >= generation.created_at)
  ) {
    return edited;
  }
  return generation;
}

export function detailBody(
  session: SessionRow,
  activities: SessionActivityWithRecord[],
  reports: ReportRow[],
) {
  const generation = latestOf(reports, "generation");
  const edited = latestOf(reports, "edited");
  const verification = latestOf(reports, "verification");
  const final = latestOf(reports, "final");
  const state = parseStepState(session.step_state);
  const view = (r: ReportRow | null) => (r === null ? null : reportView(r));
  const current = currentOf(generation, edited);
  return {
    session: {
      id: session.id,
      status: session.status,
      currentStep: session.current_step,
      progress: progress(state),
      academicYear: session.academic_year,
      gradeLabel: session.grade_label,
      semester: session.semester,
      area: session.area,
      subject: session.subject,
      activityName: session.activity_name,
      schoolPrompt: session.school_prompt,
      teacherNote: session.teacher_note,
      targetChars: session.target_chars,
      targetCharsMode: session.target_chars_mode,
      career: session.career,
      growthApplied: session.growth_applied,
      growthSnapshot: session.growth_snapshot,
      planItemId: session.plan_item_id,
      replyPending: session.reply_pending,
      regenerateCount: session.regenerate_count,
      terminal: state.terminal ?? null,
      lastActivityAt: session.last_activity_at,
      completedAt: session.completed_at,
    },
    activities: activities.map((a) => ({
      activityRecordId: a.activity_record_id,
      role: a.role,
      fitScore: a.fit_score,
      fitReasons: a.fit_reasons,
      analysis: a.analysis,
      analysisSource: a.analysis_source,
      record: a.record,
    })),
    reports: {
      generation: view(generation),
      edited: view(edited),
      verification: view(verification),
      final: view(final),
    },
    regenerationsLeft: MAX_REGENERATIONS - session.regenerate_count,
    current: view(current),
  };
}

// ---------------------------------------------------------------------------
// 쿼리
// ---------------------------------------------------------------------------

export type ReportsQuery =
  | { ok: true; sessionId?: string }
  | { ok: false; reason: string };

export function parseReportsQuery(query: unknown): ReportsQuery {
  const q = (query ?? {}) as Record<string, unknown>;
  if (q.sessionId === undefined) return { ok: true };
  if (typeof q.sessionId !== "string" || !UUID_RE.test(q.sessionId)) {
    return { ok: false, reason: "sessionId 형식이 올바르지 않아요." };
  }
  return { ok: true, sessionId: q.sessionId };
}
