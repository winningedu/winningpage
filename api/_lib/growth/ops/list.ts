// 관리자 성장설계 회차 목록(GET /api/admin/growth-reports)의 순수 규칙.
// 쿼리 파싱, ilike 이스케이프, 행 변환만 둔다. DB 호출은 핸들러가 한다.

import { parseStepState, progress } from "../report/stepState.js";
import type { StepNumber, StepStatus } from "../report/types.js";

export const REPORT_STATUSES = [
  "draft",
  "in_progress",
  "completed",
  "archived",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type ListQuery = {
  status: ReportStatus | null;
  q: string | null;
  page: number;
  pageSize: number;
};

type RawQuery = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function positiveInt(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

export function parseListQuery(
  raw: RawQuery,
): { ok: true; query: ListQuery } | { ok: false; reason: string } {
  const page = positiveInt(first(raw.page), 1);
  if (page === null) return { ok: false, reason: "page 가 올바르지 않습니다." };
  const size = positiveInt(first(raw.pageSize), DEFAULT_PAGE_SIZE);
  if (size === null)
    return { ok: false, reason: "pageSize 가 올바르지 않습니다." };

  const statusRaw = first(raw.status);
  let status: ReportStatus | null = null;
  if (statusRaw !== undefined && statusRaw !== "") {
    if (!(REPORT_STATUSES as readonly string[]).includes(statusRaw))
      return { ok: false, reason: "status 가 올바르지 않습니다." };
    status = statusRaw as ReportStatus;
  }

  const q = first(raw.q)?.trim() || null;
  return {
    ok: true,
    query: { status, q, page, pageSize: Math.min(size, MAX_PAGE_SIZE) },
  };
}

/**
 * PostgREST ilike 패턴용 이스케이프. 와일드카드(%, _)와 이스케이프 문자(\)는
 * 리터럴로 바꾸고, or() 필터 구문을 깨는 쉼표와 괄호는 지운다.
 */
export function escapeIlike(input: string): string {
  return input.replace(/[,()]/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type ReportListRow = {
  id: string;
  profile_id: string;
  status: string;
  current_step: number;
  track: string | null;
  issued_at: string | null;
  last_activity_at: string;
  ledger_id: string | null;
  ledger_reversed_at: string | null;
  step_state: unknown;
};

export type ProfileSummary = { name: string | null; email: string | null };

export type ReportListItem = {
  id: string;
  profileId: string;
  studentName: string | null;
  email: string | null;
  status: string;
  currentStep: number;
  track: string | null;
  issuedAt: string | null;
  lastActivityAt: string;
  ledgerId: string | null;
  ledgerReversedAt: string | null;
  terminal: { reason: string; at: string; step: StepNumber } | null;
  progress: {
    step: StepNumber;
    label: string;
    status: StepStatus;
    attempts: number;
  }[];
};

export function toReportListItem(
  row: ReportListRow,
  profile: ProfileSummary | undefined,
): ReportListItem {
  const state = parseStepState(row.step_state);
  return {
    id: row.id,
    profileId: row.profile_id,
    studentName: profile?.name ?? null,
    email: profile?.email ?? null,
    status: row.status,
    currentStep: row.current_step,
    track: row.track,
    issuedAt: row.issued_at,
    lastActivityAt: row.last_activity_at,
    ledgerId: row.ledger_id,
    ledgerReversedAt: row.ledger_reversed_at,
    terminal: state.terminal ?? null,
    progress: progress(state),
  };
}
