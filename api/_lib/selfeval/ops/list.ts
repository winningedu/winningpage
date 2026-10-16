// 관리자 자기평가서 세션 목록과 상세(GET /api/admin/selfeval-sessions)의 순수 규칙.
// 쿼리 파싱, 검색 필터 조립, 행 변환만 둔다. DB 호출은 핸들러가 한다.
// 페이지 파싱과 ilike 이스케이프는 성장설계 운영 목록과 같은 규칙이라 그대로 가져다 쓴다.

import { escapeIlike, parseListQuery } from "../../growth/ops/list.js";
import { parseStepState, progress } from "../session.js";
import type { StepTerminal } from "../types.js";

export type { ProfileSummary } from "../../growth/ops/list.js";
export { escapeIlike };

import type { ProfileSummary } from "../../growth/ops/list.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SessionsQuery =
  | { kind: "detail"; sessionId: string }
  | {
      kind: "list";
      status: "draft" | "in_progress" | "completed" | "archived" | null;
      q: string | null;
      page: number;
      pageSize: number;
    };

type RawQuery = Record<string, string | string[] | undefined>;

export function parseSessionsQuery(
  raw: RawQuery,
): { ok: true; query: SessionsQuery } | { ok: false; reason: string } {
  const idRaw = Array.isArray(raw.sessionId) ? raw.sessionId[0] : raw.sessionId;
  if (idRaw !== undefined && idRaw !== "") {
    if (!UUID_RE.test(idRaw.trim()))
      return { ok: false, reason: "sessionId 가 올바르지 않습니다." };
    return { ok: true, query: { kind: "detail", sessionId: idRaw.trim() } };
  }
  const parsed = parseListQuery(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, query: { kind: "list", ...parsed.query } };
}

/**
 * PostgREST or() 필터 문자열. 프로필(이름, 이메일) 검색 결과 id 와 과목 부분 일치를 함께 건다.
 * 프로필이 하나도 없으면 과목 조건만 남긴다(빈 in() 은 구문 오류).
 */
export function buildSearchFilter(q: string, profileIds: string[]): string {
  const subject = `subject.ilike.%${escapeIlike(q)}%`;
  if (profileIds.length === 0) return subject;
  return `profile_id.in.(${profileIds.join(",")}),${subject}`;
}

export type SessionListRow = {
  id: string;
  profile_id: string;
  status: string;
  current_step: number;
  academic_year: number | null;
  semester: number | null;
  area: string | null;
  subject: string | null;
  activity_name: string | null;
  regenerate_count: number;
  ledger_id: string | null;
  ledger_reversed_at: string | null;
  step_state: unknown;
  last_activity_at: string;
  completed_at: string | null;
};

export type SessionProgress = ReturnType<typeof progress>;

export type SessionListItem = {
  id: string;
  profileId: string;
  studentName: string | null;
  email: string | null;
  status: string;
  currentStep: number;
  academicYear: number | null;
  semester: number | null;
  area: string | null;
  subject: string | null;
  activityName: string | null;
  regenerateCount: number;
  ledgerId: string | null;
  ledgerReversedAt: string | null;
  terminal: StepTerminal | null;
  progress: SessionProgress;
  lastActivityAt: string;
  completedAt: string | null;
};

export function toSessionListItem(
  row: SessionListRow,
  profile: ProfileSummary | undefined,
): SessionListItem {
  const state = parseStepState(row.step_state);
  return {
    id: row.id,
    profileId: row.profile_id,
    studentName: profile?.name ?? null,
    email: profile?.email ?? null,
    status: row.status,
    currentStep: row.current_step,
    academicYear: row.academic_year,
    semester: row.semester,
    area: row.area,
    subject: row.subject,
    activityName: row.activity_name,
    regenerateCount: row.regenerate_count,
    ledgerId: row.ledger_id,
    ledgerReversedAt: row.ledger_reversed_at,
    terminal: state.terminal ?? null,
    progress: progress(state),
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
  };
}

export type DetailActivityRow = {
  activity_record_id: string;
  role: string;
  fit_score: number | null;
  analysis_source: string | null;
};

export type DetailReportRow = {
  id: string;
  report_type: string;
  revision: number;
  score: number | null;
  created_at: string;
};

export function toSessionDetail(
  session: SessionListRow & Record<string, unknown>,
  profile: ProfileSummary | undefined,
  activities: DetailActivityRow[],
  reports: DetailReportRow[],
) {
  const item = toSessionListItem(session, profile);
  return {
    session,
    studentName: item.studentName,
    email: item.email,
    terminal: item.terminal,
    progress: item.progress,
    activities: activities.map((a) => ({
      activityRecordId: a.activity_record_id,
      role: a.role,
      fitScore: a.fit_score,
      analysisSource: a.analysis_source,
    })),
    reports: reports.map((r) => ({
      id: r.id,
      type: r.report_type,
      revision: r.revision,
      score: r.score,
      createdAt: r.created_at,
    })),
  };
}
