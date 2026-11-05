// 수행평가 현황(W8 수행평가 탭). 진행 단계는 가장 최근 세션의 단계, 제출 건수는 모든 세션의 제출 합,
// 피드백은 가장 최근 제출이 평가 리포트를 받았는지다(결정 4: 평가 리포트가 만들어진 과제가 피드백 완료).
// 단계 이름은 위닝에듀 운영 구조(5단계)를 따른다(결정 14).

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";
import { kstDateOffset } from "./goalStatus.js";

export const PERFORMANCE_STEPS = [
  "기본 정보",
  "안내문 입력",
  "주제 추천",
  "설계 리포트",
  "작성과 평가",
] as const;

export interface PerformanceStatus {
  step: number;
  stage: string;
  submissionCount: number;
  /** 제출이 없으면 null. */
  feedback: "waiting" | "done" | null;
  /** 가장 최근 제출일(KST, YYYY-MM-DD). 제출이 없으면 null. */
  lastSubmittedAt: string | null;
}

const ID_CHUNK = 100;

interface SessionRow {
  id: string;
  profile_id: string;
  current_step: number;
  updated_at: string;
}

async function inChunks<T>(
  ids: string[],
  read: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    rows.push(...(await read(ids.slice(i, i + ID_CHUNK))));
  }
  return rows;
}

/** 세션이 있는 학생만 맵에 담는다. */
export async function loadPerformanceStatus(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, PerformanceStatus>> {
  const sessions = await inChunks(studentIds, (chunk) =>
    readAll<SessionRow>(
      admin,
      "performance_sessions",
      "id, profile_id, current_step, updated_at",
      (q) => q.in("profile_id", chunk),
    ),
  );
  const sessionIds = sessions.map((s) => s.id);
  const [submissions, reports] = await Promise.all([
    inChunks(sessionIds, (chunk) =>
      readAll<{ session_id: string; submitted_at: string | null }>(
        admin,
        "performance_submissions",
        "session_id, submitted_at",
        (q) => q.in("session_id", chunk),
      ),
    ),
    inChunks(sessionIds, (chunk) =>
      readAll<{ session_id: string; report_type: string }>(
        admin,
        "performance_reports",
        "session_id, report_type",
        (q) => q.in("session_id", chunk),
      ),
    ),
  ]);
  const evaluated = new Set(
    reports
      .filter((r) => r.report_type === "evaluation")
      .map((r) => r.session_id),
  );

  const profileOf = new Map(sessions.map((s) => [s.id, s.profile_id]));
  const submittedBy = new Map<string, { at: string; sessionId: string }[]>();
  for (const sub of submissions) {
    const profile = profileOf.get(sub.session_id);
    if (!profile || !sub.submitted_at) continue;
    submittedBy.set(profile, [
      ...(submittedBy.get(profile) ?? []),
      { at: sub.submitted_at, sessionId: sub.session_id },
    ]);
  }

  const latestSession = new Map<string, SessionRow>();
  for (const s of sessions) {
    const seen = latestSession.get(s.profile_id);
    if (!seen || s.updated_at > seen.updated_at)
      latestSession.set(s.profile_id, s);
  }

  return new Map(
    [...latestSession].map(([profile, session]) => {
      const submitted = submittedBy.get(profile) ?? [];
      const last = submitted.reduce<(typeof submitted)[number] | null>(
        (best, s) => (best === null || s.at > best.at ? s : best),
        null,
      );
      const step = Math.min(
        Math.max(session.current_step, 1),
        PERFORMANCE_STEPS.length,
      );
      return [
        profile,
        {
          step,
          stage: PERFORMANCE_STEPS[step - 1] ?? "",
          submissionCount: submitted.length,
          feedback: last
            ? evaluated.has(last.sessionId)
              ? "done"
              : "waiting"
            : null,
          lastSubmittedAt: last ? kstDateOffset(new Date(last.at), 0) : null,
        },
      ];
    }),
  );
}
