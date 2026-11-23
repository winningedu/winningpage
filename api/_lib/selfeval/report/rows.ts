// 리포트 입력 행 변환(명세 No.140, 141, 158). DB 행에서 순수 규칙만 떼어 단위로 검증한다.

import { academicYearWindow } from "./date.js";
import type {
  LinkType,
  RecordStatus,
  ReportLink,
  ReportRecord,
} from "./inputs.js";

export type ActivityRow = {
  id: string;
  source_program: "performance" | "deep" | "self" | "manual" | "upload";
  entry_kind: "performance" | "deep" | "activity" | null;
  subject: string | null;
  course_name: string | null;
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
  numbers: unknown;
  sources: unknown;
  summary: string | null;
  reflection: string | null;
  record_status: RecordStatus | null;
  status: "planned" | "draft" | "confirmed" | "final";
  submitted_at: string | null;
  created_at: string;
  parent_record_id: string | null;
};

export const ACTIVITY_COLUMNS =
  "id, source_program, entry_kind, subject, course_name, topic, concept, method, result, limitation, numbers, sources, summary, reflection, record_status, status, submitted_at, created_at, parent_record_id";

export type LinkRow = {
  from_record_id: string;
  to_record_id: string;
  link_type: LinkType;
  strength: "explicit" | "implicit";
  confirmed: boolean;
  deleted: boolean;
};

export const LINK_COLUMNS =
  "from_record_id, to_record_id, link_type, strength, confirmed, deleted";

/** record_status 가 null 인 옛 행은 status 에서 파생한다(planned 면 plan, 그 밖은 completed). */
export function recordStatusOf(
  row: Pick<ActivityRow, "record_status" | "status">,
): RecordStatus {
  return row.record_status ?? (row.status === "planned" ? "plan" : "completed");
}

export function toReportRecord(
  row: ActivityRow,
  selectedRole: "core" | "support" | null,
): ReportRecord {
  return {
    id: row.id,
    sourceProgram: row.source_program as "performance" | "deep" | "manual",
    entryKind: row.entry_kind,
    subject: row.subject,
    courseName: row.course_name,
    topic: row.topic,
    concept: row.concept,
    method: row.method,
    result: row.result,
    limitation: row.limitation,
    numbers: row.numbers,
    sources: row.sources,
    summary: row.summary,
    reflection: row.reflection,
    recordStatus: recordStatusOf(row),
    submittedAt: row.submitted_at ?? row.created_at,
    parentRecordId: row.parent_record_id,
    selectedRole,
  };
}

const SOURCES = new Set(["performance", "deep", "manual"]);

/** 02장이 모으는 기록: 수행평가, 심화탐구, 직접 입력이며 학년도 1년(3월 1일부터 다음 해 2월 말, KST) 안. */
export function keepRecord(row: ActivityRow, academicYear: number): boolean {
  if (!SOURCES.has(row.source_program)) return false;
  const { from, to } = academicYearWindow(academicYear);
  const at = Date.parse(row.submitted_at ?? row.created_at);
  return at >= Date.parse(from) && at < Date.parse(to);
}

/** 수기 메모의 작성일(yyyy-mm-dd)이 학년도 안인지(No.158). 날짜가 없으면 쓰지 않는다. */
export function memoInWindow(
  writtenAt: string | null,
  academicYear: number,
): boolean {
  if (writtenAt === null) return false;
  const day = writtenAt.slice(0, 10);
  return day >= `${academicYear}-03-01` && day < `${academicYear + 1}-03-01`;
}

/** 지운 연결과 학생이 확인하지 않은 암묵 연결은 리포트에 쓰지 않는다(No.185, 193). */
export function toReportLink(row: LinkRow): ReportLink | null {
  if (row.deleted) return null;
  if (row.strength === "implicit" && !row.confirmed) return null;
  return {
    fromRecordId: row.from_record_id,
    toRecordId: row.to_record_id,
    linkType: row.link_type,
    strength: row.strength,
  };
}
