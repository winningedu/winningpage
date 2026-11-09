// 코칭 판정 엔진에 넣을 자료를 서비스별 테이블에서 읽는다(W9). 서비스를 쓰지 않으면 그 자료는 null,
// 자료 출처가 없는 지표(내신과 모의고사 변화 등)는 읽지 않고 비워 둔다(결정 4).
// 최근 접속은 profiles.last_seen_at(session-check 가 적는다)에서 읽고, KST 날짜 차이로 센다(결정 105).

import type { SupabaseClient } from "@supabase/supabase-js";
import { diffDaysYMD, kstYMD } from "../../../src/lib/goal/calc/index.js";
import { deriveGradeSystem } from "../../../src/lib/goal/report/aggregate.js";
import {
  type AreaScores,
  type CoachingMetrics,
  type DiagnosisTrend,
  type GradeCurve,
  type GrowthAxisKey,
  type GrowthAxisState,
  mockChangeScore,
  naesinChangeScore,
  type TopicFit,
} from "./coaching.js";
import { reportAreas } from "./diagnosisStatus.js";
import { readAll } from "./directory.js";
import {
  buildGoalDays,
  type GoalDay,
  type GoalRecord,
  type GoalSchedule,
  summarizeGoalWeek,
  weekWindows,
} from "./goalRate.js";
import type { ServiceKey } from "./serviceUsage.js";

const AREA_BY_LABEL: Record<string, keyof AreaScores> = {
  "목표 설정": "GOAL",
  "계획 설계": "PLAN",
  "실행 지속": "EXEC",
  "시간 관리": "TIME",
  "학습 피드백": "FEEDBACK",
  "학습 안정": "STABILITY",
  "교과 관리": "SUBJECT",
  "수행 대응": "PERFORM",
  "탐구 심화": "INQUIRY",
  "활동 연계": "ACTIVITY",
  "기록 정리": "RECORD",
  "입시 전략": "STRATEGY",
};

const TREND_BY_CODE: Record<string, DiagnosisTrend> = {
  UP_MOST: "up",
  UP_PART: "up",
  FLAT: "flat",
  VOLATILE: "flat",
  DOWN_PART: "partial_down",
};

const FIT_BY_LABEL: Record<string, TopicFit> = {
  맞음: "fit",
  보통: "normal",
  어긋남: "off",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const lastBy = <T>(rows: T[], key: (row: T) => string): T | undefined =>
  rows.reduce<T | undefined>(
    (best, row) => (best === undefined || key(row) > key(best) ? row : best),
    undefined,
  );

interface DailyRecord extends GoalRecord {
  reasons?: unknown;
}

function diagnosisFrom(
  report: { payload: unknown; snapshot: unknown } | undefined,
): CoachingMetrics["diagnosis"] {
  if (!report || !isRecord(report.payload)) return null;
  const areas: Partial<AreaScores> = {};
  const { page1, page2 } = reportAreas(report.payload);
  for (const entry of [...page1, ...page2]) {
    const code = AREA_BY_LABEL[entry.name];
    if (code) areas[code] = entry.score;
  }
  if (Object.keys(AREA_BY_LABEL).length !== Object.keys(areas).length)
    return null;
  const code = isRecord(report.snapshot) ? report.snapshot.gradeTrend : null;
  return {
    areas: areas as AreaScores,
    trend: typeof code === "string" ? (TREND_BY_CODE[code] ?? null) : null,
  };
}

function growthFrom(
  report: { axis_scores: unknown; sections: unknown } | undefined,
): CoachingMetrics["growth"] {
  if (!report) return null;
  const axes: Record<GrowthAxisKey, GrowthAxisState | null> = {
    A: null,
    B: null,
    C: null,
    D: null,
    E: null,
  };
  if (Array.isArray(report.axis_scores)) {
    for (const e of report.axis_scores) {
      if (!isRecord(e) || !(typeof e.axis === "string" && e.axis in axes))
        continue;
      if (
        e.verdict !== "confirmed" &&
        e.verdict !== "caution" &&
        e.verdict !== "none"
      )
        continue;
      axes[e.axis as GrowthAxisKey] = {
        verdict: e.verdict,
        count: toNumber(e.count),
        required: toNumber(e.required),
        ...(e.optional === true ? { optional: true } : {}),
      };
    }
  }
  const item = Array.isArray(report.sections)
    ? report.sections.find(
        (s) => isRecord(s) && s.id === "1-12" && s.status === "ok",
      )
    : undefined;
  const verdict =
    isRecord(item) && isRecord(item.body) ? item.body.verdict : null;
  const curve =
    verdict === "rising" ||
    verdict === "flat" ||
    verdict === "falling" ||
    verdict === "not_judgeable"
      ? (verdict as GradeCurve)
      : null;
  return { axes, curve };
}

/** 최근 목표일부터 거꾸로 이어진 최소 목표 충족일 수. */
function streakOf(days: GoalDay[]): number {
  let streak = 0;
  for (const d of days.filter((x) => x.weekday !== "sun" && x.ideal > 0)) {
    if (d.actual < d.min) break;
    streak += 1;
  }
  return streak;
}

function avgActual(days: GoalDay[]): number | null {
  const set = days.filter((d) => d.weekday !== "sun" && d.ideal > 0);
  return set.length ? set.reduce((s, d) => s + d.actual, 0) / set.length : null;
}

/** 성적 기록(records 배열)에서 직전과 최신 값을 읽어 변화 점수로 바꾼다. 둘 미만이면 null. */
function changeOf(
  scores: unknown,
  toScore: (previous: number, current: number) => number,
): number | null {
  const list =
    isRecord(scores) && Array.isArray(scores.records) ? scores.records : [];
  const values = list
    .filter(
      (r) => isRecord(r) && r.none !== true && typeof r.value === "number",
    )
    .sort((a, b) =>
      String(a.examDate ?? a.enteredAt ?? a.recordedAt ?? "").localeCompare(
        String(b.examDate ?? b.enteredAt ?? b.recordedAt ?? ""),
      ),
    )
    .map((r) => r.value as number);
  if (values.length < 2) return null;
  return toScore(
    values[values.length - 2] as number,
    values[values.length - 1] as number,
  );
}

function topicTitle(detail: unknown): string | null {
  return isRecord(detail) && typeof detail.title === "string"
    ? detail.title
    : null;
}

function narrativeKeywords(
  reports: { created_at: string; narrative_theme?: string | null }[],
): string[] {
  const latest = lastBy(reports, (r) => r.created_at);
  return latest?.narrative_theme ? [latest.narrative_theme] : [];
}

export interface CoachingData {
  performanceTasks: {
    title: string | null;
    subject: string | null;
    done: boolean;
    score: number | null;
  }[];
  goalFacts: import("./coachingText.js").GoalFacts | null;
  pendingPerformance: { title: string | null; subject: string | null }[];
  inquiryTopic: string | null;
  growthKeywords: string[];
  grade: string | null;
  /** profiles.last_seen_at 그대로(ISO). 기록이 없으면 null. */
  lastSeenAt: string | null;
  metrics: CoachingMetrics;
  targets: {
    ideal: { university: string; department: string } | null;
    min: { university: string; department: string } | null;
  } | null;
}

/** 학생 한 명의 서비스별 자료. used 는 서비스 이용 여부(serviceUsage)다. */
export async function loadCoachingData(
  admin: SupabaseClient,
  studentId: string,
  used: ServiceKey[],
  now = new Date(),
): Promise<CoachingData> {
  const uses = (key: ServiceKey) => used.includes(key);

  const [diagnosis, goalStudent, records, growth, perf, inquiry, selfeval] =
    await Promise.all([
      uses("diagnosis")
        ? readAll<{
            diagnosed_at: string;
            payload: unknown;
            snapshot: unknown;
          }>(
            admin,
            "diagnosis_reports",
            "diagnosed_at, payload, snapshot",
            (q) => q.eq("profile_id", studentId),
            "attempt_id",
          )
        : [],
      uses("goal")
        ? readAll<{
            ideal_university: string;
            ideal_department: string;
            min_university: string;
            min_department: string;
            study_schedule: unknown;
            grade: string;
            naesin_scores: unknown;
            mock_exam_scores: unknown;
          }>(
            admin,
            "goal_students",
            "ideal_university, ideal_department, min_university, min_department, study_schedule, grade, naesin_scores, mock_exam_scores",
            (q) => q.eq("profile_id", studentId),
            "profile_id",
          )
        : [],
      uses("goal")
        ? readAll<DailyRecord>(
            admin,
            "goal_daily_records",
            "record_date, target_ideal_hours, target_min_hours, study_hours, reasons",
            (q) => q.eq("profile_id", studentId),
          )
        : ([] as DailyRecord[]),
      uses("growth")
        ? readAll<{
            created_at: string;
            axis_scores: unknown;
            sections: unknown;
            narrative_theme: string | null;
          }>(
            admin,
            "growth_reports",
            "created_at, axis_scores, sections, narrative_theme",
            (q) => q.eq("profile_id", studentId).eq("status", "completed"),
          )
        : [],
      uses("performance")
        ? readAll<{
            id: string;
            selected_topic_id: string | null;
            subject: string | null;
          }>(
            admin,
            "performance_sessions",
            "id, selected_topic_id, subject",
            (q) => q.eq("profile_id", studentId),
          )
        : ([] as {
            id: string;
            selected_topic_id: string | null;
            subject: string | null;
          }[]),
      uses("inquiry")
        ? readAll<{
            created_at: string;
            selected_topic_id: string | null;
            latest_evaluation_id: string | null;
          }>(
            admin,
            "inquiry_sessions",
            "created_at, selected_topic_id, latest_evaluation_id",
            (q) => q.eq("profile_id", studentId),
          )
        : [],
      uses("selfeval")
        ? readAll<{ created_at: string; score: number | null }>(
            admin,
            "selfeval_reports",
            "created_at, score",
            (q) =>
              q.eq("profile_id", studentId).eq("report_type", "verification"),
          )
        : ([] as { created_at: string; score: number | null }[]),
    ]);
  const seenRows = await readAll<{ last_seen_at: string | null }>(
    admin,
    "profiles",
    "last_seen_at",
    (q) => q.eq("id", studentId),
  );

  const goal = goalStudent[0];
  const today = kstYMD(now);
  const lastSeenAt = seenRows[0]?.last_seen_at ?? null;
  // 접속한 날과 오늘의 KST 달력 날짜 차이. 기록이 없으면 null(미접속 규칙을 건너뛴다).
  const daysSinceLastSeen = lastSeenAt
    ? diffDaysYMD(kstYMD(new Date(lastSeenAt)), today)
    : null;
  const windows = weekWindows(today);
  const schedule = isRecord(goal?.study_schedule)
    ? (goal?.study_schedule as GoalSchedule)
    : null;
  // 표와 문구는 최근 날짜부터 읽으므로 뒤집어 둔다.
  const days = buildGoalDays(windows.thisWeek, records, schedule).reverse();
  const week = summarizeGoalWeek(days);
  const lastDays = buildGoalDays(
    windows.previousWeek,
    records,
    schedule,
  ).reverse();
  const lastWeek = summarizeGoalWeek(lastDays);
  const sinceWeek = windows.thisWeek;
  const grade = goal?.grade ?? null;
  const system = deriveGradeSystem(grade, today);

  const sessionIds = perf.map((s) => s.id);
  const perfReports = sessionIds.length
    ? await readAll<{ session_id: string; score: number | null }>(
        admin,
        "performance_reports",
        "session_id, score",
        (q) => q.in("session_id", sessionIds).eq("report_type", "evaluation"),
      )
    : [];
  // 피드백 완료 = 평가 리포트가 만들어진 과제(결정 4). 과제마다 점수는 하나만 센다.
  const doneSessions = [...new Set(perfReports.map((r) => r.session_id))];
  const scores = doneSessions
    .map((id) => perfReports.find((r) => r.session_id === id)?.score)
    .filter((s): s is number => typeof s === "number");

  const session = lastBy(inquiry, (s) => s.created_at);
  const topics = session?.selected_topic_id
    ? await readAll<{ fit: string; detail: unknown }>(
        admin,
        "inquiry_topics",
        "fit, detail",
        (q) => q.eq("id", session.selected_topic_id as string),
      )
    : [];
  const pendingSessions = perf.filter((s) => !doneSessions.includes(s.id));
  const topicIds = perf
    .map((s) => s.selected_topic_id)
    .filter((id): id is string => typeof id === "string");
  const performanceTopics = topicIds.length
    ? await readAll<{ id: string; title: string | null }>(
        admin,
        "performance_topics",
        "id, title",
        (q) => q.in("id", topicIds),
      )
    : [];
  const inquiryReports = session?.latest_evaluation_id
    ? await readAll<{ score: number | null }>(
        admin,
        "inquiry_reports",
        "score",
        (q) => q.eq("id", session.latest_evaluation_id as string),
      )
    : [];

  const usedMap = Object.fromEntries(
    (
      [
        "diagnosis",
        "goal",
        "growth",
        "performance",
        "selfeval",
        "inquiry",
      ] as const
    ).map((k) => [k, uses(k)]),
  ) as Record<ServiceKey, boolean>;

  return {
    lastSeenAt,
    metrics: {
      used: usedMap,
      diagnosis: diagnosisFrom(lastBy(diagnosis, (r) => r.diagnosed_at)),
      goal: uses("goal")
        ? {
            week,
            naesinChangeScore: changeOf(goal?.naesin_scores, (prev, cur) =>
              naesinChangeScore(prev, cur, system === "5등급제" ? 5 : 9),
            ),
            mockChangeScore: changeOf(goal?.mock_exam_scores, mockChangeScore),
          }
        : null,
      growth: growthFrom(lastBy(growth, (r) => r.created_at)),
      performance: uses("performance")
        ? {
            avgScore: scores.length
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : null,
            tasks: sessionIds.length,
            feedbackDone: doneSessions.length,
          }
        : null,
      inquiry: uses("inquiry")
        ? {
            topicFit: FIT_BY_LABEL[topics[0]?.fit ?? ""] ?? null,
            reportScore: inquiryReports[0]?.score ?? null,
          }
        : null,
      selfeval: uses("selfeval")
        ? {
            verifyScore:
              lastBy(
                selfeval.filter((r) => r.score !== null),
                (r) => r.created_at,
              )?.score ?? null,
          }
        : null,
    },
    goalFacts: uses("goal")
      ? {
          week,
          lastWeek: lastWeek.setDays > 0 ? lastWeek : null,
          previousDays: lastDays,
          days,
          streak: streakOf(days),
          daysSinceLastSeen,
          reasons: records
            .filter((r) => sinceWeek.includes(r.record_date))
            .flatMap((r) => (Array.isArray(r.reasons) ? r.reasons : [])),
          lastWeekAvgActual: avgActual(lastDays),
        }
      : null,
    performanceTasks: perf.map((s) => ({
      title:
        performanceTopics.find((t) => t.id === s.selected_topic_id)?.title ??
        null,
      subject: s.subject,
      done: doneSessions.includes(s.id),
      score: perfReports.find((r) => r.session_id === s.id)?.score ?? null,
    })),
    pendingPerformance: pendingSessions.map((s) => ({
      title:
        performanceTopics.find((t) => t.id === s.selected_topic_id)?.title ??
        null,
      subject: s.subject,
    })),
    inquiryTopic: topicTitle(topics[0]?.detail),
    growthKeywords: narrativeKeywords(growth),
    grade,
    targets: goal
      ? {
          ideal: goal.ideal_university
            ? {
                university: goal.ideal_university,
                department: goal.ideal_department,
              }
            : null,
          min: goal.min_university
            ? {
                university: goal.min_university,
                department: goal.min_department,
              }
            : null,
        }
      : null,
  };
}
