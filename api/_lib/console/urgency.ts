// 학습진단 긴급도(결정 3, 36). 학생의 가장 최근 저장 리포트에서 12개 영역 중 가장 낮은 점수로 4단계를 낸다.
// 기준은 45, 60, 70점이다. 리포트가 없는 학생은 값이 없다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

export type UrgencyLevel = "low" | "mid" | "high" | "very_high";

interface ReportRow {
  profile_id: string;
  diagnosed_at: string;
  payload: {
    areaDetails?: {
      page1?: { score?: unknown }[];
      page2?: { score?: unknown }[];
    };
  } | null;
}

const ID_CHUNK = 100;

function levelOf(lowest: number): UrgencyLevel {
  if (lowest < 45) return "very_high";
  if (lowest < 60) return "high";
  if (lowest < 70) return "mid";
  return "low";
}

function lowestScore(payload: ReportRow["payload"]): number | null {
  const scores = [
    ...(payload?.areaDetails?.page1 ?? []),
    ...(payload?.areaDetails?.page2 ?? []),
  ]
    .map((a) => a.score)
    .filter((s): s is number => typeof s === "number");
  return scores.length > 0 ? Math.min(...scores) : null;
}

/** 리포트가 있는 학생만 맵에 들어 있다. */
export async function loadUrgency(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, UrgencyLevel>> {
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    chunks.push(studentIds.slice(i, i + ID_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAll<ReportRow>(
        admin,
        "diagnosis_reports",
        "profile_id, diagnosed_at, payload",
        (q) => q.in("profile_id", chunk),
        "attempt_id",
      ),
    ),
  );
  const latest = new Map<string, ReportRow>();
  for (const row of pages.flat()) {
    const seen = latest.get(row.profile_id);
    if (!seen || row.diagnosed_at > seen.diagnosed_at) {
      latest.set(row.profile_id, row);
    }
  }
  const levels = new Map<string, UrgencyLevel>();
  for (const [id, row] of latest) {
    const lowest = lowestScore(row.payload);
    if (lowest !== null) levels.set(id, levelOf(lowest));
  }
  return levels;
}
