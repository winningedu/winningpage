// 목표관리 리포트(성장 리포트 주간/월간 · 학습방향 리포트) 순수 집계 함수.
//
// 이 파일은 supabase 를 전혀 모른다 — 전부 행 배열(DB에서 이미 읽어 온 snake_case
// 객체)과 원시 값(YMD 문자열 등)을 인자로 받아 숫자·구조를 계산만 한다. DB 조회는
// api/_lib/goal/repo.ts, DB 접속, 라우팅은 api/goal/report.js 가 맡는다, 그래야
// 이 파일을 supabase 없이 aggregate.test.ts 로 직접 테스트할 수 있다.
//
// 기간 경계는 순수 달력이다(팀장 확정, 변경 금지) — 주간 = 월~일, 월간 = 1일~말일.
// getWeeklyReportRange · 가상 주차 함수는 이 모듈에서 절대 쓰지 않는다.
//
// 달성률·완성도의 분모(effectiveStart)는 "기간 시작과 actual_start_date 중 늦은 날"부터
// "오늘과 기간 끝 중 이른 날"까지다 — computeEffectiveWindow() 가 그 경계를 계산하고,
// getEffectiveScheduleTarget(calc/schedule.js, 동결 순수 함수)이 그 경계 안의
// 요일별 목표(월~토, 일요일 제외)를 합산한다. 새 요일 합산 로직을 이 파일에 만들지 않는다.

import { GRADE_PERCENTILE } from "../calc/jeongsi.js";
import type { DaySchedule } from "../calc/schedule.js";
import { getEffectiveScheduleTarget } from "../calc/schedule.js";
import { addDaysYMD, getMondayYMD } from "../calc/virtualDate.js";

const MS_PER_DAY = 86400000;

// goal_students 행 — 이 파일이 실제로 읽는 필드만(온보딩 컷 4종 + 시작일 +
// getEffectiveScheduleTarget/calc/schedule.js 에 그대로 넘기는 study_schedule).
// 그 외 컬럼(확률·target 대학 등)은 이 모듈이 쓰지 않아 index signature 로 열어 둔다.
export interface GoalStudentRow {
  actual_start_date?: string | null;
  ideal_naesin_cut?: number | string | null;
  min_naesin_cut?: number | string | null;
  ideal_jungsi_cut?: number | string | null;
  min_jungsi_cut?: number | string | null;
  study_schedule?: Record<string, DaySchedule | undefined> | null;
  grade?: string | null;
  [key: string]: unknown;
}

// goal_daily_records 행 — study_hours/record_date/profile_id/body_condition/reasons/tasks.
export interface GoalDailyRecordRow {
  study_hours?: number | string | null;
  record_date?: string;
  profile_id?: string;
  body_condition?: string | null;
  reasons?: string[] | null;
  tasks?: string[] | null;
}

// goal_timer_sessions 행 — duration_seconds/subject/started_at.
export interface GoalTimerSessionRow {
  duration_seconds?: number | string | null;
  subject?: string | null;
  started_at?: string | null;
}

// naesin_scores.records[] / mock_exam_scores.records[] 원소, 또는 온보딩 고정 회차 엔트리.
export interface GoalScoreEntry {
  value?: number | string | null;
  subjects?: {
    korean?: number | string | null;
    math?: number | string | null;
    english?: number | string | null;
    science?: number | string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// 공통 숫자 헬퍼
// ---------------------------------------------------------------------------

export function toNum(
  value: unknown,
  fallback: number | null = 0,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round1(value: unknown): number {
  return Math.round((toNum(value) ?? 0) * 10) / 10;
}

function round0(value: unknown): number {
  return Math.round(toNum(value) ?? 0);
}

function clamp0to100(value: unknown): number {
  return Math.min(100, Math.max(0, toNum(value) ?? 0));
}

// ---------------------------------------------------------------------------
// YMD 문자열 유틸 — 'YYYY-MM-DD'는 사전순 = 시간순이라 문자열 비교로 충분하다
// (schedule.js getEffectiveScheduleTarget 헤더 주석의 동일 전제를 그대로 따른다).
// ---------------------------------------------------------------------------

function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isValidYm(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function maxYmd(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null | undefined {
  if (!isValidYmd(a)) return b;
  if (!isValidYmd(b)) return a;
  return a > b ? a : b;
}

function minYmd(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null | undefined {
  if (!isValidYmd(a)) return b;
  if (!isValidYmd(b)) return a;
  return a < b ? a : b;
}

/** 월의 마지막 날짜(YYYY-MM-DD). ym='YYYY-MM'. */
export function lastDayOfMonthYmd(ym: string): string {
  // ym='YYYY-MM' 형식 보장(호출부 resolveMonthlyPeriod 의 isValidYm 체크)
  const [y, m] = ym.split("-").map(Number) as [number, number];
  // UTC 기준 다음 달 0일 = 이번 달 마지막 날 (윤년 자동 처리, virtualDate.js addDaysYMD와 동일 기법).
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' 두 날짜 사이(양끝 포함) 일수. 역순이면 0. */
export function diffDaysInclusive(
  startYmd: string | null | undefined,
  endYmd: string | null | undefined,
): number {
  if (!isValidYmd(startYmd) || !isValidYmd(endYmd) || startYmd > endYmd)
    return 0;
  const start = Date.UTC(
    ...(startYmd
      .split("-")
      .map(Number)
      .map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]),
  );
  const end = Date.UTC(
    ...(endYmd
      .split("-")
      .map(Number)
      .map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]),
  );
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

// ---------------------------------------------------------------------------
// 기간 경계 — 순수 달력
// ---------------------------------------------------------------------------

/**
 * 주간 리포트 기간. periodParam 은 "그 주의 아무 날짜"든 받아 월요일로 정규화한다
 * (팀장 확정 "period=주 시작 월요일 YMD" — 정확히 월요일이 아니어도 방어적으로 보정).
 */
export function resolveWeeklyPeriod(
  periodParam: string | null | undefined,
  nowYmd: string,
): { periodKey: string; start: string; end: string; periodLabel: string } {
  const anchor = isValidYmd(periodParam) ? periodParam : nowYmd;
  const start = getMondayYMD(anchor);
  const end = addDaysYMD(start, 6);
  return { periodKey: start, start, end, periodLabel: `${start} ~ ${end}` };
}

/**
 * 월간 리포트 기간. periodParam 은 'YYYY-MM'.
 */
export function resolveMonthlyPeriod(
  periodParam: string | null | undefined,
  nowYmd: string,
): { periodKey: string; start: string; end: string; periodLabel: string } {
  const ym = isValidYm(periodParam) ? periodParam : nowYmd.slice(0, 7);
  const start = `${ym}-01`;
  const end = lastDayOfMonthYmd(ym);
  return { periodKey: ym, start, end, periodLabel: `${start} ~ ${end}` };
}

export interface EffectiveWindow {
  start: string | null | undefined;
  end: string | null | undefined;
  elapsedDays: number;
}

/**
 * 달성률·완성도 분모가 쓰는 유효 구간 — max(기간 시작, actual_start_date) ~
 * min(기간 끝, 오늘). actual_start_date 가 없으면(온보딩 직후 등) 기간 시작을 그대로 쓴다.
 * 역전(시작 > 끝, 예: 기간 전체가 미래이거나 온보딩 전)이면 elapsedDays=0.
 */
export function computeEffectiveWindow({
  periodStart,
  periodEnd,
  actualStartDate,
  nowYmd,
}: {
  periodStart: string;
  periodEnd: string;
  actualStartDate?: string | null | undefined;
  nowYmd: string;
}): EffectiveWindow {
  const start = maxYmd(periodStart, actualStartDate || periodStart);
  const end = minYmd(periodEnd, nowYmd);
  if (!start || !end || start > end)
    return { start: null, end: null, elapsedDays: 0 };
  return { start, end, elapsedDays: diffDaysInclusive(start, end) };
}

// ---------------------------------------------------------------------------
// D1/D2 — 공부 시간 · 달성률
// ---------------------------------------------------------------------------

/** D1 — 기간 내 goal_daily_records.study_hours 합. */
export function computeStudyHours(records: GoalDailyRecordRow[]): number {
  return round1(
    records.reduce((sum, r) => sum + (toNum(r.study_hours) ?? 0), 0),
  );
}

/**
 * 최근 N일 순공시간 평균(대시보드 웰컴 카드 "학습 시간 격차" 전용). 분모는 조회 기간
 * 일수가 아니라 실제 기록이 있는 행 수다 — 학생이 건너뛴 날을 0으로 채워 평균을
 * 깎지 않는다(실측만 반영, 판단 지점). 기록이 0건이면 null(억지 산출 금지 — 호출부가
 * "학습 시간 격차" 행을 렌더에서 뺀다).
 */
export function computeAvgStudyHours(
  records: GoalDailyRecordRow[],
): number | null {
  if (records.length === 0) return null;
  const total = records.reduce(
    (sum, r) => sum + (toNum(r.study_hours) ?? 0),
    0,
  );
  return round1(total / records.length);
}

/**
 * D2 — 이상/최소 달성률. 분자는 기간 전체 공부 시간(D1과 동일), 분모는
 * effectiveWindow 안의 요일별 목표 합(getEffectiveScheduleTarget, 일요일 제외).
 * effectiveWindow 가 없으면(아직 시작 전 등) 0%.
 */
export function computeAchievementRate({
  totalStudyHours,
  student,
  effectiveWindow,
}: {
  totalStudyHours: number;
  student: GoalStudentRow;
  effectiveWindow: EffectiveWindow;
}): {
  idealRate: number;
  minRate: number;
  idealTargetHours: number;
  minTargetHours: number;
} {
  if (!effectiveWindow.start || !effectiveWindow.end) {
    return { idealRate: 0, minRate: 0, idealTargetHours: 0, minTargetHours: 0 };
  }
  const target = getEffectiveScheduleTarget(
    // getEffectiveScheduleTarget 은 study_schedule 만 읽는다(calc/schedule.js) — null/누락 모두
    // `student?.study_schedule || {}`로 동일하게 처리되므로 값 변경 없이 정규화만(exactOptionalPropertyTypes
    // 는 명시적 `undefined` 프로퍼티도 허용하지 않아 조건부로만 넣는다).
    student.study_schedule != null
      ? { study_schedule: student.study_schedule }
      : {},
    effectiveWindow.start,
    effectiveWindow.end,
  );
  const idealRate =
    target.ideal > 0 ? round0((totalStudyHours / target.ideal) * 100) : 0;
  const minRate =
    target.min > 0 ? round0((totalStudyHours / target.min) * 100) : 0;
  return {
    idealRate,
    minRate,
    idealTargetHours: target.ideal,
    minTargetHours: target.min,
  };
}

// ---------------------------------------------------------------------------
// D3 — 완성도(0~100)
// ---------------------------------------------------------------------------

/**
 * 완성도 = 0.5×min(100,이상달성률) + 0.3×(기록 제출일수÷경과일수×100) + 0.2×(과제 done÷전체×100).
 * 기간 내 과제 0건이면 계획 축을 빼고 0.5/0.3 을 0.625/0.375 로 재정규화한다(팀장 확정).
 */
export function computeCompletionScore({
  idealRate,
  recordDays,
  elapsedDays,
  doneTasks,
  totalTasks,
}: {
  idealRate: number;
  recordDays: number;
  elapsedDays: number;
  doneTasks: number;
  totalTasks: number;
}): number {
  const achievementAxis = clamp0to100(idealRate);
  const consistencyAxis =
    elapsedDays > 0 ? clamp0to100((recordDays / elapsedDays) * 100) : 0;

  if (totalTasks > 0) {
    const planAxis = clamp0to100((doneTasks / totalTasks) * 100);
    return round0(
      0.5 * achievementAxis + 0.3 * consistencyAxis + 0.2 * planAxis,
    );
  }

  return round0(0.625 * achievementAxis + 0.375 * consistencyAxis);
}

/**
 * 계획 과제 달성/미달성/미기록 집계(행305) — goal_plan_tasks.status 3종.
 * computeCompletionScore의 doneTasks/totalTasks는 이 결과의 done/total과
 * 그대로 호환된다(같은 done 판정 기준). status가 없거나(백필 전 행) 알 수
 * 없는 값이면 pending으로 방어한다(api/_lib/goal/repo.ts normalizePlanTaskStatus와
 * 동일 규칙 — 이 파일은 supabase를 모르므로 값만 다시 좁혀 쓴다).
 */
export function summarizePlanTaskCompletion(tasks: { status?: unknown }[]): {
  done: number;
  fail: number;
  pending: number;
  total: number;
} {
  let done = 0;
  let fail = 0;
  let pending = 0;
  for (const task of tasks) {
    if (task.status === "done") done++;
    else if (task.status === "fail") fail++;
    else pending++;
  }
  return { done, fail, pending, total: tasks.length };
}

// ---------------------------------------------------------------------------
// D4 — 목표군 내 위치(코호트 백분위)
// ---------------------------------------------------------------------------

/** goal_daily_records 원본 행(profile_id, study_hours) → 프로필별 합산 [{profileId, hours}]. */
export function sumHoursByProfile(
  records: GoalDailyRecordRow[],
): { profileId: string; hours: number }[] {
  const totals: Record<string, number> = {};
  for (const record of records) {
    const profileId = String(record.profile_id);
    totals[profileId] =
      (totals[profileId] || 0) + (toNum(record.study_hours) ?? 0);
  }
  return Object.entries(totals).map(([profileId, hours]) => ({
    profileId,
    hours: round1(hours),
  }));
}

/**
 * 동일 이상목표 대학·학과 코호트(본인 포함) 안에서 기간 합산 순공시간 순위.
 * 코호트가 2명 미만이면 표본 부족.
 */
export function computeCohortPercentile(
  selfProfileId: string,
  cohortHours: { profileId: string; hours: number }[] | null | undefined,
): {
  insufficientSample: boolean;
  rank: number | null;
  total: number;
  topPercent: number | null;
} {
  if (!Array.isArray(cohortHours) || cohortHours.length < 2) {
    return {
      insufficientSample: true,
      rank: null,
      total: cohortHours?.length ?? 0,
      topPercent: null,
    };
  }
  const self = cohortHours.find((x) => x.profileId === selfProfileId);
  const selfHours = self ? (toNum(self.hours) ?? 0) : 0;
  const better = cohortHours.filter(
    (x) => (toNum(x.hours) ?? 0) > selfHours,
  ).length;
  const rank = better + 1;
  const topPercent = Math.max(1, round0((rank / cohortHours.length) * 100));
  return {
    insufficientSample: false,
    rank,
    total: cohortHours.length,
    topPercent,
  };
}

// ---------------------------------------------------------------------------
// D6 — 컨디션 4종(항상 전부 노출)
// ---------------------------------------------------------------------------

const CONDITION_ORDER = [
  { code: "great", emoji: "😆", label: "아주 좋음" },
  { code: "normal", emoji: "🙂", label: "보통" },
  { code: "tired", emoji: "😣", label: "피곤함" },
  { code: "exhausted", emoji: "😫", label: "힘듦" },
] as const;

/**
 * D6 — 컨디션별 일수(ConditionListCard) + 컨디션별 평균 공부시간(ConditionTileCard).
 * 4종 전부 항상 반환한다(기록 0건인 컨디션도 "0일"로 노출).
 */
export function computeConditionBreakdown(records: GoalDailyRecordRow[]): {
  listRows: { emoji: string; label: string; value: string }[];
  tiles: { emoji: string; label: string; value: string; avg: string }[];
} {
  const byCondition: Record<string, { count: number; sum: number }> =
    Object.fromEntries(
      CONDITION_ORDER.map((c) => [c.code, { count: 0, sum: 0 }]),
    );

  for (const record of records) {
    const bucket = record.body_condition
      ? byCondition[record.body_condition]
      : undefined;
    if (!bucket) continue; // ''(카드-only 제출)는 집계 제외 — 컨디션 미입력.
    bucket.count += 1;
    bucket.sum += toNum(record.study_hours) ?? 0;
  }

  const listRows = CONDITION_ORDER.map((c) => ({
    emoji: c.emoji,
    label: c.label,
    // byCondition 은 CONDITION_ORDER 코드로만 초기화됨(위) — c.code 는 항상 존재
    value: `${byCondition[c.code]!.count}일`,
  }));

  const tiles = CONDITION_ORDER.map((c) => {
    const { count, sum } = byCondition[c.code]!;
    return {
      emoji: c.emoji,
      label: c.label,
      value: `${count}일`,
      avg: `평균 ${count > 0 ? round1(sum / count) : 0}h`,
    };
  });

  return { listRows, tiles };
}

// ---------------------------------------------------------------------------
// D7 — 과목별 학습 비중(타이머 세션 기준)
// ---------------------------------------------------------------------------

const SUBJECT_LABELS: Record<string, string> = {
  korean: "국어",
  math: "수학",
  english: "영어",
  science: "탐구",
  social: "사회",
  history: "한국사",
  second_lang: "제2외국어",
  etc: "기타",
};

/** D7 — goal_timer_sessions.duration_seconds 를 과목별 비중(%)으로. 세션 없으면 empty. */
export function computeSubjectShare(
  sessions: GoalTimerSessionRow[],
):
  | { empty: true; rows: [] }
  | { empty: false; rows: { label: string; value: number }[] } {
  const totals: Record<string, number> = {};
  let total = 0;

  for (const session of sessions) {
    const seconds = toNum(session.duration_seconds, 0) ?? 0;
    if (seconds <= 0) continue;
    const code =
      session.subject && session.subject in SUBJECT_LABELS
        ? session.subject
        : "etc";
    totals[code] = (totals[code] || 0) + seconds;
    total += seconds;
  }

  if (total <= 0) return { empty: true, rows: [] };

  const rows = Object.entries(totals)
    .map(([code, seconds]) => ({
      // totals 의 code 는 항상 SUBJECT_LABELS 키("etc" 포함, 위 loop 참고)
      label: SUBJECT_LABELS[code]!,
      value: round0((seconds / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  return { empty: false, rows };
}

// ---------------------------------------------------------------------------
// D8 — 시간대별 학습 효율(7버킷, 심야 0~6 포함)
// ---------------------------------------------------------------------------

const TIME_SLOT_BUCKETS = [
  { label: "심야 0~6", startHour: 0, endHour: 6 },
  { label: "오전 6~9", startHour: 6, endHour: 9 },
  { label: "오전 9~12", startHour: 9, endHour: 12 },
  { label: "오후 12~3", startHour: 12, endHour: 15 },
  { label: "오후 3~6", startHour: 15, endHour: 18 },
  { label: "오후 6~9", startHour: 18, endHour: 21 },
  { label: "오후 9~12", startHour: 21, endHour: 24 },
] as const;

/** 세션 started_at(timestamptz ISO)의 KST 시(0~23). */
function kstHour(isoString: string): number {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

/**
 * D8 — 세션을 시작 시각(KST) 기준으로 7버킷에 귀속시킨다(경계 걸침 분할은 하지 않는다 —
 * "시작 시각이 속한 버킷 전체"로 판단, 판단 지점).
 */
export function bucketTimeSlots(
  sessions: GoalTimerSessionRow[],
): { label: string; value: number; unit: "h" }[] {
  const buckets = TIME_SLOT_BUCKETS.map((b) => ({
    label: b.label,
    startHour: b.startHour,
    endHour: b.endHour,
    seconds: 0,
  }));

  for (const session of sessions) {
    const seconds = toNum(session.duration_seconds, 0) ?? 0;
    if (seconds <= 0 || !session.started_at) continue;
    const hour = kstHour(session.started_at);
    const bucket = buckets.find((b) => hour >= b.startHour && hour < b.endHour);
    if (bucket) bucket.seconds += seconds;
  }

  return buckets.map((b) => ({
    label: b.label,
    value: round1(b.seconds / 3600),
    unit: "h" as const,
  }));
}

// ---------------------------------------------------------------------------
// D9(부분)/기타 — 방해요인 · 완료 학습 항목 카운트
// ---------------------------------------------------------------------------

/** 방해요인 카운트 — '없었음'은 방해요인이 아니라 "없었다"는 응답이라 차트에서 제외한다. */
export function computeDistraction(
  records: GoalDailyRecordRow[],
): { label: string; value: number; unit: "회" }[] {
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const label of record.reasons || []) {
      if (label === "없었음") continue;
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value, unit: "회" as const }))
    .sort((a, b) => b.value - a.value);
}

/** 완료한 핵심 학습 항목 카운트. */
export function computeCoreItems(
  records: GoalDailyRecordRow[],
): { label: string; value: number; unit: "회" }[] {
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const label of record.tasks || []) {
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value, unit: "회" as const }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// 요일별/주차별 공부 시간 막대(StudyTimeBarChartCard)
// ---------------------------------------------------------------------------

const DAY_LABELS_MON_TO_SUN = ["월", "화", "수", "목", "금", "토", "일"];

/** 주간 리포트 — 월~일 7개 막대. */
export function buildWeeklyStudyTimeBars(
  records: GoalDailyRecordRow[],
  weekStart: string,
): { label: string; value: number }[] {
  const hoursByDate: Record<string, number> = {};
  for (const record of records) {
    if (!record.record_date) continue;
    hoursByDate[record.record_date] =
      (hoursByDate[record.record_date] || 0) + (toNum(record.study_hours) ?? 0);
  }

  return DAY_LABELS_MON_TO_SUN.map((label, index) => {
    const date = addDaysYMD(weekStart, index);
    return { label, value: round1(hoursByDate[date] || 0) };
  });
}

export interface MonthlyWeekBar {
  label: string;
  weekLabel: string;
  hours: number;
  idealRate: number;
  minRate: number;
}

/**
 * 월간 리포트 — 월 전체에 걸치는 달력 주차(월~일) 단위 막대 + 주차별 이상/최소 달성률.
 * 월 경계를 걸치는 주는 그 달에 속한 날짜만 합산한다(달력 월 기준 리포트이므로).
 * effectiveWindow(=actual_start_date~오늘)는 주 단위로도 동일하게 적용한다 — 시작 전/미래
 * 주는 목표가 0이라 달성률도 0%가 된다(전체 기간 effectiveWindow 규칙과 동일 취지).
 */
export function buildMonthlyWeeks({
  records,
  student,
  monthStart,
  monthEnd,
  nowYmd,
}: {
  records: GoalDailyRecordRow[];
  student: GoalStudentRow;
  monthStart: string;
  monthEnd: string;
  nowYmd: string;
}): MonthlyWeekBar[] {
  const hoursByDate: Record<string, number> = {};
  for (const record of records) {
    if (!record.record_date) continue;
    hoursByDate[record.record_date] =
      (hoursByDate[record.record_date] || 0) + (toNum(record.study_hours) ?? 0);
  }

  const weeks: MonthlyWeekBar[] = [];
  let cursor = getMondayYMD(monthStart);
  let weekIndex = 0;

  while (cursor <= monthEnd) {
    const weekMonday = cursor;
    const weekSunday = addDaysYMD(cursor, 6);
    const clippedStart = maxYmd(weekMonday, monthStart) as string;
    const clippedEnd = minYmd(weekSunday, monthEnd) as string;

    if (clippedStart <= clippedEnd) {
      weekIndex += 1;

      let hours = 0;
      let day = clippedStart;
      while (day <= clippedEnd) {
        hours += hoursByDate[day] || 0;
        day = addDaysYMD(day, 1);
      }

      const effectiveWindow = computeEffectiveWindow({
        periodStart: clippedStart,
        periodEnd: clippedEnd,
        actualStartDate: student.actual_start_date,
        nowYmd,
      });
      const { idealRate, minRate } = computeAchievementRate({
        totalStudyHours: round1(hours),
        student,
        effectiveWindow,
      });

      weeks.push({
        label: `${weekIndex}주`,
        weekLabel: `${weekIndex}주차`,
        hours: round1(hours),
        idealRate,
        minRate,
      });
    }

    cursor = addDaysYMD(cursor, 7);
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// D-합격가능성 델타(goal_probability_logs 스냅샷 차)
// ---------------------------------------------------------------------------

interface AdmissionProbSnapshot {
  startValue: number | null | undefined;
  endValue: number | null | undefined;
}

/**
 * 기간 시작·끝 확률 스냅샷의 차(각 스냅샷 자체가 이미 clamp(0,100)된 값이므로
 * 델타를 다시 clamp하지 않는다 — Σdelta 누적이 아니라 두 시점 값의 단순 차).
 */
function buildAdmissionBlock(
  university: string,
  susiSnapshot: AdmissionProbSnapshot,
  jeongsiSnapshot: AdmissionProbSnapshot,
) {
  function toDelta(snapshot: AdmissionProbSnapshot) {
    const start = toNum(snapshot.startValue, 0) ?? 0;
    const end = toNum(snapshot.endValue, 0) ?? 0;
    const diff = round1(end - start);
    return {
      delta: {
        direction: diff < 0 ? ("down" as const) : ("up" as const),
        value: `${Math.abs(diff).toFixed(2)}%`,
      },
      rate: round1(end),
    };
  }
  return {
    university,
    susi: toDelta(susiSnapshot),
    jeongsi: toDelta(jeongsiSnapshot),
  };
}

// goal_probability_logs 스냅샷 행(susi/jungsi 4계열) — ideal/min × susi/jungsi.
interface GoalProbabilityLogRow {
  ideal_susi?: number | null;
  ideal_jungsi?: number | null;
  min_susi?: number | null;
  min_jungsi?: number | null;
}

export function computeAdmissionDelta({
  targets,
  startLog,
  endLog,
}: {
  targets: {
    ideal: { university?: string; department?: string };
    min: { university?: string; department?: string };
  };
  startLog: GoalProbabilityLogRow | null;
  endLog: GoalProbabilityLogRow | null;
}) {
  const start = startLog || {};
  const end = endLog || {};

  const upperUniversity = [targets.ideal.university, targets.ideal.department]
    .filter(Boolean)
    .join(" ");
  const lowerUniversity = [targets.min.university, targets.min.department]
    .filter(Boolean)
    .join(" ");

  return {
    upper: buildAdmissionBlock(
      upperUniversity,
      { startValue: start.ideal_susi, endValue: end.ideal_susi },
      { startValue: start.ideal_jungsi, endValue: end.ideal_jungsi },
    ),
    lower: buildAdmissionBlock(
      lowerUniversity,
      { startValue: start.min_susi, endValue: end.min_susi },
      { startValue: start.min_jungsi, endValue: end.min_jungsi },
    ),
  };
}

// ---------------------------------------------------------------------------
// D12 — 등급제 표기(학년도 파생)
// ---------------------------------------------------------------------------

/**
 * grade('고1'|'고2'|'고3')와 오늘(KST YMD)로 그 학생이 적용받는 대입 학년도의 등급제를 판정한다.
 * 2028학년도 대입(2027년 11월 수능 응시, 2028년 3월 입학)부터 5등급제 — 그 전은 9등급제.
 * grade 가 고1~3 패턴이 아니면(중학생 등) 판단 근거가 없어 9등급제로 기본값 처리한다(팀장 확정
 * "판단 애매하면 9등급제 기본").
 */
export function deriveGradeSystem(
  grade: string | null | undefined,
  nowYmd: string,
): "5등급제" | "9등급제" {
  const match = /^고([1-3])$/.exec(String(grade || "").trim());
  if (!match || !isValidYmd(nowYmd)) return "9등급제";

  const gradeNum = Number(match[1]);
  // nowYmd 는 위에서 isValidYmd 로 'YYYY-MM-DD' 형식 확인됨
  const [y, m] = nowYmd.split("-").map(Number) as [number, number];
  // 한국 학년도는 3월 시작 — 1~2월은 전년도 학년도 소속.
  const schoolYear = m >= 3 ? y : y - 1;
  // 이 학생이 고3이 되는 학년도(= 수능 응시 학년도).
  const admissionSchoolYear = schoolYear + (3 - gradeNum);
  // 대입 학년도(입학 연도) = 수능 응시 학년도 + 1.
  const admissionCalendarYear = admissionSchoolYear + 1;

  return admissionCalendarYear >= 2028 ? "5등급제" : "9등급제";
}

// ---------------------------------------------------------------------------
// 학습방향 리포트(#37 내신 / #38 정시) — 과목군 구간 분류
// ---------------------------------------------------------------------------

const NAESIN_SUBJECT_ORDER = [
  { key: "korean", name: "국어군" },
  { key: "math", name: "수학군" },
  { key: "english", name: "영어군" },
  // 사회/과학 분기는 goal_students 에 계열(track) 컬럼이 없어 판정 근거가 없다(D14, 팀장 확정) —
  // 항상 "탐구군" 제네릭 라벨을 쓴다.
  { key: "science", name: "탐구군" },
] as const;

const JEONGSI_SUBJECT_ORDER = [
  { key: "korean", name: "국어" },
  { key: "math", name: "수학" },
  { key: "english", name: "영어" },
  { key: "science", name: "탐구" },
] as const;

/** 백분위 → 9등급(GRADE_PERCENTILE 역조회). 표 밖 값은 경계 등급으로 clamp. */
export function percentileToGrade(percentile: number): number {
  const p = clamp0to100(percentile);
  for (let grade = 1; grade <= 9; grade += 1) {
    const band = GRADE_PERCENTILE[grade];
    if (band && p >= band.min && p <= band.max) return grade;
  }
  return p >= 96 ? 1 : 9;
}

export type GoalDirectionZone = "strong" | "improve" | "focus";

/** 내신 과목군 구간(등급 낮을수록 우세) — 이상 목표선 이내=강점 유지, 최소 목표선 이내=보완 필요, 밖=집중 보완. */
export function classifyNaesinZone(
  subjectGrade: number,
  idealCut: number | null | undefined,
  minCut: number | null | undefined,
): GoalDirectionZone {
  if (idealCut != null && subjectGrade <= idealCut) return "strong";
  if (minCut != null && subjectGrade <= minCut) return "improve";
  return "focus";
}

/** 정시 과목 구간(백분위 높을수록 우세) — 등급 판정과 부등호 방향만 반대. */
export function classifyJeongsiZone(
  subjectPercentile: number,
  idealCut: number | null | undefined,
  minCut: number | null | undefined,
): GoalDirectionZone {
  if (idealCut != null && subjectPercentile >= idealCut) return "strong";
  if (minCut != null && subjectPercentile >= minCut) return "improve";
  return "focus";
}

const ZONE_LABELS: Record<GoalDirectionZone, string> = {
  strong: "강점 유지 구간",
  improve: "보완 필요 구간",
  focus: "집중 보완 구간",
};

/**
 * 내신 리포트용 과목군 4개 지표. entry 는 naesin_scores.records[] 원소 또는
 * 온보딩 고정 회차 엔트리(§4 회차 칩 판단 지점 참고) — 둘 다 {value, subjects:{...}} 모양이다.
 * subjects 가 없는(온보딩 4회차처럼 과목별 세분 없이 value 하나뿐인) 엔트리는 과목군 4개 모두
 * 그 단일 평균값으로 채운다(과목별 세분 데이터가 없어 구간·배지가 전 과목군 동일해진다 — 판단 지점).
 */
export function buildNaesinSubjectMetrics(
  student: GoalStudentRow,
  entry: GoalScoreEntry | null | undefined,
): {
  name: string;
  zoneLabel: string;
  zone: GoalDirectionZone;
  badge: string;
  grade: number;
}[] {
  const idealCut = toNum(student.ideal_naesin_cut, null);
  const minCut = toNum(student.min_naesin_cut, null);
  const hasSubjects = entry?.subjects && typeof entry.subjects === "object";

  return NAESIN_SUBJECT_ORDER.map(({ key, name }) => {
    const grade = hasSubjects
      ? (toNum(entry?.subjects?.[key], toNum(entry?.value) ?? 0) ?? 0)
      : (toNum(entry?.value) ?? 0);
    const zone = classifyNaesinZone(grade, idealCut, minCut);
    return {
      name,
      zoneLabel: ZONE_LABELS[zone],
      zone,
      badge: `${round1(grade).toFixed(2)} 등급`,
      grade,
    };
  });
}

/** 정시 리포트용 과목 4개 지표. entry 는 mock_exam_scores.records[] 원소 또는 온보딩 고정 회차. */
export function buildJeongsiSubjectMetrics(
  student: GoalStudentRow,
  entry: GoalScoreEntry | null | undefined,
): {
  name: string;
  zoneLabel: string;
  zone: GoalDirectionZone;
  badge: string;
  percentile: number;
}[] {
  const idealCut = toNum(student.ideal_jungsi_cut, null);
  const minCut = toNum(student.min_jungsi_cut, null);
  const hasSubjects = entry?.subjects && typeof entry.subjects === "object";

  return JEONGSI_SUBJECT_ORDER.map(({ key, name }) => {
    const percentile = hasSubjects
      ? (toNum(entry?.subjects?.[key], toNum(entry?.value) ?? 0) ?? 0)
      : (toNum(entry?.value) ?? 0);
    const zone = classifyJeongsiZone(percentile, idealCut, minCut);
    const grade = percentileToGrade(percentile);
    return {
      name,
      zoneLabel: ZONE_LABELS[zone],
      zone,
      badge: `${grade}등급 (백분위 ${round1(percentile)})`,
      percentile,
    };
  });
}

/**
 * 정시 "종합 백분위" — 4과목 단순 평균(frozen calcJeongsiCompositeFE 는 영어 감점 등 온보딩 base
 * 확률 산출 전용 파이프라인이라 이 표시용 요약에는 재사용하지 않는다, 판단 지점).
 */
export function computeJeongsiComposite(
  entry: GoalScoreEntry | null | undefined,
): number {
  const hasSubjects = entry?.subjects && typeof entry.subjects === "object";
  if (!hasSubjects) return round1(entry?.value);
  const values = JEONGSI_SUBJECT_ORDER.map(
    ({ key }) => toNum(entry?.subjects?.[key]) ?? 0,
  );
  return round1(values.reduce((s, v) => s + v, 0) / values.length);
}
