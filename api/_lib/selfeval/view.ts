// selfeval 조회 API 응답 조립(명세 No.15~18, 65, 75, 계획서 §2 10~13).
// 순수 모듈이다. 핸들러는 db.ts 로 읽은 행을 여기에 넘기고 결과를 그대로 응답한다.

import type { z } from "zod";
import {
  analysisSchema,
  generationReportViewSchema,
  verificationReportViewSchema,
} from "../../../shared/selfeval/session.js";
import type { QuotaSnapshot } from "../serviceAccess.js";
import { tenantReasonExtra } from "../tenantUsage.js";
import { normalizeSections, type SourceTypeOf } from "./evidence.js";
import { sourceTypeOfRecord } from "./evidenceSources.js";
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
import { careerOf } from "./steps/shared.js";
import {
  type ActivityRecordLike,
  type GrowthSnapshot,
  type HighGrade,
  MAX_REGENERATIONS,
  type ReportType,
  type StepTerminal,
} from "./types.js";

const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];

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
  /** 스쿨멘토 기관 거부 사유. 위닝은 넘기지 않는다. */
  tenantReason?: string | null;
  /** 남은 횟수가 0 인 기관 한도 사유(month_cap, term_cap). 진입 거부 사유가 없을 때 대신 싣는다. */
  capReason?: string | null | undefined;
  activityCount: number;
  open: SessionListRow | null;
  growth: GrowthSnapshot | null;
  now: Date;
  profile: StudentProfileRow | null;
  replyResent: number;
  /** 회원(세션 주인)의 시간대(profiles.time_zone). 학년도와 오래됨 판정의 날짜 기준이다. */
  timeZone: string;
};

function profileView(profile: StudentProfileRow) {
  const semester: 1 | 2 | null =
    profile.semester === 1 ? 1 : profile.semester === 2 ? 2 : null;
  return {
    gradeLabel: GRADES.includes(profile.grade as HighGrade)
      ? (profile.grade as HighGrade)
      : null,
    semester,
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
    ...tenantReasonExtra(input.tenantReason ?? input.capReason),
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
            stale: isGrowthStale(growth.issuedAt, input.now, input.timeZone),
            banner: bannerSummary(growth, profile?.gradeLabel ?? undefined),
            planItems: growth.planItems,
          },
    profile,
    replyResent: input.replyResent,
    academicYearDefault: currentAcademicYear(input.now, input.timeZone),
    timeZone: input.timeZone,
  };
}

// ---------------------------------------------------------------------------
// 상세
// ---------------------------------------------------------------------------

export type SessionActivityWithRecord = SessionActivityRow & {
  record: ActivityRecordLike;
};

export type ReportView = z.output<typeof generationReportViewSchema>;
export type VerificationView = z.output<typeof verificationReportViewSchema>;

/** 저장된 행의 jsonb 를 계약 스키마로 읽는다. 모양이 맞지 않으면 ZodError 를 던져 응답으로 내보내지 않는다. */
function reportView(row: ReportRow, typeOf?: SourceTypeOf): ReportView {
  return generationReportViewSchema.parse({
    id: row.id,
    revision: row.revision,
    // 옛 단일 근거 모양으로 저장된 본문도 배열 근거로 읽는다(명세 No.145).
    sections: normalizeSections(row.sections, typeOf),
    charCount: row.char_count ?? null,
    score: row.score,
    mandatoryFixes: row.mandatory_fixes,
    createdAt: row.created_at,
  });
}

function verificationView(row: ReportRow): VerificationView {
  return verificationReportViewSchema.parse({
    id: row.id,
    revision: row.revision,
    sections: row.sections,
    charCount: row.char_count ?? null,
    score: row.score,
    mandatoryFixes: row.mandatory_fixes,
    createdAt: row.created_at,
  });
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
  memos: { id: string; writtenAt: string | null; text: string }[] = [],
) {
  const generation = latestOf(reports, "generation");
  const edited = latestOf(reports, "edited");
  const verification = latestOf(reports, "verification");
  const final = latestOf(reports, "final");
  const state = parseStepState(session.step_state);
  // 선택 기록을 아는 호출만 옛 근거의 출처 유형을 정확히 찾는다. 기록 목록이 비어 있으면 찾지 않는다.
  const typeOf: SourceTypeOf | undefined =
    activities.length === 0
      ? undefined
      : (id) => {
          const found = activities.find((a) => a.activity_record_id === id);
          return found === undefined
            ? null
            : sourceTypeOfRecord({
                sourceProgram: found.record.sourceProgram,
                subjectGroup: found.record.subjectGroup,
                entryKind: null,
              });
        };
  const view = (r: ReportRow | null) =>
    r === null ? null : reportView(r, typeOf);
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
      career: careerOf(session),
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
      analysis: analysisSchema.nullable().parse(a.analysis),
      analysisSource: a.analysis_source,
      record: a.record,
    })),
    reports: {
      generation: view(generation),
      edited: view(edited),
      verification:
        verification === null ? null : verificationView(verification),
      final: view(final),
    },
    memos,
    regenerationsLeft: MAX_REGENERATIONS - session.regenerate_count,
    current: view(current),
  };
}
