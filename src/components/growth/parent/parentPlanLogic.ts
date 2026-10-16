import type { ReportPlanItem } from "@/lib/growth/api";
import { PRIORITY_LABELS, PROGRAM_LABELS } from "../plan/planLogic";

// 학부모 열람 화면의 실행계획 읽기 전용 행. 서버 planItems 는 DB 컬럼 그대로(snake_case)라
// 화면이 쓰는 값만 골라 안전하게 읽는다. 형식이 맞지 않는 행은 버린다.
export type ParentPlanRow = {
  id: string;
  title: string;
  programLabel: string;
  priorityLabel: string;
  done: boolean;
  deadlineLabel: string | null;
};

function isProgram(v: unknown): v is keyof typeof PROGRAM_LABELS {
  return typeof v === "string" && v in PROGRAM_LABELS;
}

function isPriority(v: unknown): v is keyof typeof PRIORITY_LABELS {
  return typeof v === "string" && v in PRIORITY_LABELS;
}

/** `2026-11-30` 또는 ISO 문자열을 `11월 30일`로. 잘못된 값이면 null. */
export function formatDeadline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

export function normalizeParentPlan(items: ReportPlanItem[]): ParentPlanRow[] {
  const rows: ParentPlanRow[] = [];
  for (const item of items) {
    const { title, program, priority, status, deadline } = item;
    if (typeof title !== "string" || title === "") continue;
    if (!isProgram(program) || !isPriority(priority)) continue;
    rows.push({
      id: item.id,
      title,
      programLabel: PROGRAM_LABELS[program],
      priorityLabel: PRIORITY_LABELS[priority],
      done: status === "done",
      deadlineLabel: formatDeadline(deadline),
    });
  }
  return rows;
}

export function planSummary(rows: ParentPlanRow[]): {
  total: number;
  done: number;
} {
  return { total: rows.length, done: rows.filter((r) => r.done).length };
}
