// 목표관리 현황(W5 달성율 3단계, W7 목표 실행률 평균, W8 목표관리 탭). 주간 값은 goalRate.ts 한 곳의 계산을 쓴다
// (오늘을 뺀 최근 7일, 결정 59).

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";
import {
  buildGoalDays,
  type GoalRecord,
  type GoalSchedule,
  summarizeGoalWeek,
  weekWindows,
} from "./goalRate.js";

const ID_CHUNK = 100;
// 연속 기록을 세려고 거슬러 읽는 일수.
const STREAK_LOOKBACK_DAYS = 365;

interface Target {
  university: string;
  department: string;
  /** 현재 확률(%). 목표 대학 컷이 없어 산출 전이면 null. */
  probability: number | null;
}

export interface GoalStatus {
  /** 주간 목표시간 달성율(%). 주간 이상 목표시간이 0이면 null. */
  weeklyRate: number | null;
  /** 최소 목표시간을 채운 날 수와 최소 목표가 있는 날 수(최근 7일 기록 기준). */
  minMetDays: number;
  minSetDays: number;
  /** 오늘(없으면 어제)부터 거슬러 기록이 이어진 일수. */
  streakDays: number;
  ideal: Target | null;
  min: Target | null;
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

interface StudentRow {
  profile_id: string;
  study_schedule: GoalSchedule | null;
  ideal_university: string;
  ideal_department: string;
  min_university: string;
  min_department: string;
}

interface RecordRow extends GoalRecord {
  profile_id: string;
}

const COLUMNS =
  "profile_id, study_schedule, ideal_university, ideal_department, min_university, min_department";

function target(
  university: string,
  department: string,
  probability: number | null | undefined,
): Target | null {
  if (university === "" && department === "") return null;
  return {
    university,
    department,
    probability:
      probability === null || probability === undefined
        ? null
        : Math.round(Number(probability)),
  };
}

function streakOf(dates: Set<string>, now: Date): number {
  let offset = dates.has(kstDateOffset(now, 0)) ? 0 : 1;
  let streak = 0;
  while (dates.has(kstDateOffset(now, offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

/** 목표관리를 쓰는 학생(goal_students 행이 있는 학생)만 맵에 담는다. */
export async function loadGoalStatus(
  admin: SupabaseClient,
  studentIds: string[],
  now: Date = new Date(),
  options: { streak?: boolean } = {},
): Promise<Map<string, GoalStatus>> {
  const thisWeek = weekWindows(kstDateOffset(now, 0)).thisWeek;
  const windowStart = thisWeek[0] ?? kstDateOffset(now, 7);
  const readFrom = options.streak
    ? kstDateOffset(now, STREAK_LOOKBACK_DAYS)
    : windowStart;
  const result = new Map<string, GoalStatus>();
  for (const chunk of chunked(studentIds)) {
    const [students, records, states] = await Promise.all([
      readAll<StudentRow>(
        admin,
        "goal_students",
        COLUMNS,
        (q) => q.in("profile_id", chunk),
        "profile_id",
      ),
      readAll<RecordRow>(
        admin,
        "goal_daily_records",
        "profile_id, record_date, study_hours, target_ideal_hours, target_min_hours",
        (q) => q.in("profile_id", chunk).gte("record_date", readFrom),
      ),
      options.streak
        ? readAll<{
            profile_id: string;
            ideal_susi: number | null;
            min_susi: number | null;
          }>(
            admin,
            "goal_student_state",
            "profile_id, ideal_susi, min_susi",
            (q) => q.in("profile_id", chunk),
            "profile_id",
          )
        : Promise.resolve([]),
    ]);
    const recordsOf = new Map<string, RecordRow[]>();
    for (const r of records) {
      recordsOf.set(r.profile_id, [...(recordsOf.get(r.profile_id) ?? []), r]);
    }
    const stateOf = new Map(states.map((s) => [s.profile_id, s]));

    for (const s of students) {
      const mine = recordsOf.get(s.profile_id) ?? [];
      const week = summarizeGoalWeek(
        buildGoalDays(thisWeek, mine, s.study_schedule),
      );
      result.set(s.profile_id, {
        weeklyRate:
          week.achievementPct === null ? null : Math.round(week.achievementPct),
        minMetDays: week.metDays,
        minSetDays: week.setDays,
        streakDays: options.streak
          ? streakOf(new Set(mine.map((r) => r.record_date)), now)
          : 0,
        ideal: target(
          s.ideal_university,
          s.ideal_department,
          stateOf.get(s.profile_id)?.ideal_susi,
        ),
        min: target(
          s.min_university,
          s.min_department,
          stateOf.get(s.profile_id)?.min_susi,
        ),
      });
    }
  }
  return result;
}
