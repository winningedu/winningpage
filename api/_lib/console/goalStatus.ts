// 목표관리 현황(W7 목표 실행률 평균, W8 목표관리 탭). 기록 창은 오늘(KST)을 포함한 최근 7일이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

const ID_CHUNK = 100;
const WINDOW_DAYS = 7;

export interface GoalStatus {
  /** 주간 목표시간 달성율(%). 주간 이상 목표시간이 0이면 null. */
  weeklyRate: number | null;
}

/** KST 날짜(YYYY-MM-DD)에서 days 일 전. */
export function kstDateOffset(now: Date, days: number): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - days * 86_400_000);
  return kst.toISOString().slice(0, 10);
}

function chunked(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK));
  }
  return chunks;
}

/** 목표관리를 쓰는 학생(goal_students 행이 있는 학생)만 맵에 담는다. */
export async function loadGoalStatus(
  admin: SupabaseClient,
  studentIds: string[],
  now: Date = new Date(),
): Promise<Map<string, GoalStatus>> {
  const from = kstDateOffset(now, WINDOW_DAYS - 1);
  const result = new Map<string, GoalStatus>();
  for (const chunk of chunked(studentIds)) {
    const [students, records] = await Promise.all([
      readAll<{ profile_id: string; week_ideal: number }>(
        admin,
        "goal_students",
        "profile_id, week_ideal",
        (q) => q.in("profile_id", chunk),
        "profile_id",
      ),
      readAll<{ profile_id: string; study_hours: number }>(
        admin,
        "goal_daily_records",
        "profile_id, study_hours",
        (q) => q.in("profile_id", chunk).gte("record_date", from),
      ),
    ]);
    const hours = new Map<string, number>();
    for (const r of records) {
      hours.set(
        r.profile_id,
        (hours.get(r.profile_id) ?? 0) + Number(r.study_hours),
      );
    }
    for (const s of students) {
      const target = Number(s.week_ideal);
      result.set(s.profile_id, {
        weeklyRate:
          target > 0
            ? Math.round(((hours.get(s.profile_id) ?? 0) / target) * 100)
            : null,
      });
    }
  }
  return result;
}
