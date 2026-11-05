// 성장설계 현황(W8 성장설계 탭). 학생마다 가장 최근 리포트의 스토리 대주제와 학년별 스토리 수를 읽는다.
// 키워드는 저장된 곳이 없어 읽지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

export interface GrowthStatus {
  storyTheme: string | null;
  /** 학년별 스토리(학년별 하위 주제) 수. 학년 순서대로. */
  storiesByGrade: { grade: string; count: number }[];
}

const ID_CHUNK = 100;

function storiesByGrade(value: unknown): GrowthStatus["storiesByGrade"] {
  if (!Array.isArray(value)) return [];
  const counts = new Map<string, number>();
  for (const entry of value) {
    const grade = (entry as { grade?: unknown } | null)?.grade;
    if (typeof grade === "string") {
      counts.set(grade, (counts.get(grade) ?? 0) + 1);
    }
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([grade, count]) => ({ grade, count }));
}

/** 리포트가 있는 학생만 맵에 담는다. */
export async function loadGrowthStatus(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, GrowthStatus>> {
  const latest = new Map<
    string,
    { updatedAt: string; theme: string | null; subthemes: unknown }
  >();
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    const chunk = studentIds.slice(i, i + ID_CHUNK);
    const rows = await readAll<{
      profile_id: string;
      updated_at: string;
      narrative_theme: string | null;
      grade_subthemes: unknown;
    }>(
      admin,
      "growth_reports",
      "profile_id, updated_at, narrative_theme, grade_subthemes",
      (q) => q.in("profile_id", chunk),
    );
    for (const r of rows) {
      const seen = latest.get(r.profile_id);
      if (!seen || r.updated_at > seen.updatedAt) {
        latest.set(r.profile_id, {
          updatedAt: r.updated_at,
          theme: r.narrative_theme,
          subthemes: r.grade_subthemes,
        });
      }
    }
  }
  return new Map(
    [...latest].map(([id, r]) => [
      id,
      { storyTheme: r.theme, storiesByGrade: storiesByGrade(r.subthemes) },
    ]),
  );
}
