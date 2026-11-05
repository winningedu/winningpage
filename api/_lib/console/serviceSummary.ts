// W6a 서비스별 요약 한 줄(교 #37). 서비스마다 그 학생의 기록에서 읽고, 기록이 없으면 null 이다(문구를 지어내지 않는다).
// 수행평가의 "피드백 대기"처럼 저장된 자료가 없는 항목은 싣지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { type ReadQuery, readAll } from "./directory.js";
import type { ServiceKey } from "./serviceUsage.js";

export type ServiceSummaries = Record<ServiceKey, string | null>;

interface SessionRow {
  status: string;
  created_at?: string;
}

const INQUIRY_STATUS: Record<string, string> = {
  draft: "작성 전",
  in_progress: "진행 중",
  completed: "완료",
};

const latest = <T extends { created_at?: string }>(rows: T[]): T | undefined =>
  [...rows].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0];

// 제출(completed)과 진행 중(in_progress) 건수. 둘 다 0 이면 요약하지 않는다.
function sessionCounts(rows: SessionRow[]): string | null {
  const done = rows.filter((r) => r.status === "completed").length;
  const going = rows.filter((r) => r.status === "in_progress").length;
  const parts = [
    ...(done > 0 ? [`제출 ${done}건`] : []),
    ...(going > 0 ? [`진행 중 ${going}건`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : null;
}

function readiness(payload: unknown): string | null {
  const page2 = (
    payload as { areaDetails?: { page2?: { score?: unknown }[] } } | null
  )?.areaDetails?.page2;
  const scores = (page2 ?? [])
    .map((a) => a.score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return `학교생활 준비도 ${Math.round(mean)}`;
}

export async function loadServiceSummaries(
  admin: SupabaseClient,
  studentId: string,
): Promise<ServiceSummaries> {
  const mine = <R>(q: ReadQuery<R>) => q.eq("profile_id", studentId);
  const [reports, goal, growth, performance, selfeval, inquiry] =
    await Promise.all([
      readAll<{ diagnosed_at: string; payload: unknown }>(
        admin,
        "diagnosis_reports",
        "diagnosed_at, payload",
        mine,
        "attempt_id",
      ),
      readAll<{
        ideal_university: string;
        ideal_department: string;
        min_university: string;
        min_department: string;
      }>(
        admin,
        "goal_students",
        "ideal_university, ideal_department, min_university, min_department",
        mine,
        "profile_id",
      ),
      readAll<{ narrative_theme: string | null; created_at: string }>(
        admin,
        "growth_reports",
        "narrative_theme, created_at",
        mine,
      ),
      readAll<SessionRow>(admin, "performance_sessions", "status", mine),
      readAll<SessionRow>(admin, "selfeval_sessions", "status", mine),
      readAll<SessionRow>(
        admin,
        "inquiry_sessions",
        "status, created_at",
        mine,
      ),
    ]);

  const newestReport = [...reports].sort((a, b) =>
    b.diagnosed_at.localeCompare(a.diagnosed_at),
  )[0];
  const target = goal[0];
  const theme = latest(
    growth.filter((g) => g.narrative_theme),
  )?.narrative_theme;
  const trimmed = (university: string, department: string) =>
    `${university} ${department}`.trim();
  const goalText =
    target &&
    [
      target.ideal_university &&
        `이상 ${trimmed(target.ideal_university, target.ideal_department)}`,
      target.min_university &&
        `최소 ${trimmed(target.min_university, target.min_department)}`,
    ]
      .filter(Boolean)
      .join(", ");
  const newestInquiry = latest(inquiry);

  return {
    diagnosis: newestReport ? readiness(newestReport.payload) : null,
    goal: goalText || null,
    growth: theme ? `대주제 "${theme}"` : null,
    performance: sessionCounts(performance),
    selfeval: sessionCounts(selfeval),
    inquiry: newestInquiry
      ? (INQUIRY_STATUS[newestInquiry.status] ?? null)
      : null,
  };
}
