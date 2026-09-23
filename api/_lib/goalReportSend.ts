// 목표관리 리포트 알림톡 — "조회 → 발송"을 크론 3종(일간·주간·월간)과
// 관리자 재발송(api/goal/admin/resend-report.ts)이 공유하는 부분.
//
// 로더/발송 두 단계로 나눈 이유
//   처음에는 "학생 1명분 발송" 함수 하나로 뽑았는데, 그러면 크론이 학생마다
//   그 함수를 호출해 학생 수만큼 DB 조회가 늘어난다(N+1) — 원래 크론은 기록·
//   plan_tasks·수신자를 전체 학생분 한 번씩(배치)만 조회했다. 그래서 조회
//   (loadXReportInputs)와 발송(sendXReport)을 분리한다:
//     loadXReportInputs(supabaseAdmin, studentIds, periodKey)
//       studentIds가 null이면 크론처럼 그 기간에 해당하는 학생을 직접 찾고,
//       배열이면(관리자 재발송) 그 학생들만 대상으로 한다 — 어느 쪽이든 조회는
//       기간당 고정 횟수(학생 수에 비례하지 않음)다.
//     sendXReport(supabaseAdmin, input, options)
//       이미 로드된 입력만 읽고 sendAndLog를 부른다. DB 조회는 하지 않는다
//       (sendAndLog 내부의 dedupe 조회·로그 insert는 발송 자체에 필연적이라 예외).
//   크론 = loadXReportInputs(null, 기간) 1회 + 입력 맵을 순회하며 sendXReport.
//   관리자 재발송 = loadXReportInputs([학생 1명], 기간) 1회 + sendXReport 1회.
//
// dedupeKey·variables 포맷은 절대 바꾸지 않는다
//   기존 크론이 이미 이 포맷으로 alimtalk_send_logs.dedupe_key 를 쌓아 왔다.
//   여기서 한 글자라도 달라지면 리팩토링 직후 첫 크론 실행이 "새 키"로 보여
//   중복 발송된다. goalReportSend.test.ts 가 이 포맷을 리터럴 문자열로 고정한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONDITION_LABELS, TASK_LABELS } from "../goal/daily-record.js";
import { sendAndLog } from "./alimtalkSend.js";
import {
  achievementRate,
  formatHours,
  type ReportRecipient,
  resolveParentRecipients,
  toYmd,
  weekOfMonth,
} from "./goalReportNotify.js";
import { MAX_RESEND_DAYS_AGO } from "./goalReportResendPolicy.js";

export { MAX_RESEND_DAYS_AGO };

export type ReportSendOutcome = {
  parentProfileId: string;
  phone: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
};

export type ReportSendResult = {
  studentProfileId: string;
  /** true면 승인된 학부모 연결이 없어 outcomes 가 비어 있다(에러 아님). */
  noParent: boolean;
  outcomes: ReportSendOutcome[];
};

export type ReportSendOptions = {
  /**
   * dedupeKey 뒤에 `:<suffix>` 로 덧붙는 값. 관리자 수동 재발송이 자동 발송의
   * dedupe와 충돌하지 않게 하기 위한 용도다(예: `resend:1735689600000`).
   * 지정하지 않으면(크론) 원래 dedupeKey 그대로 나간다.
   */
  dedupeSuffix?: string;
};

/** studentIds → { studentProfileId: 그 학생의 승인된 학부모 목록 } 배치 조회. */
async function groupRecipientsByStudent(
  supabaseAdmin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, ReportRecipient[]>> {
  const recipients = await resolveParentRecipients(supabaseAdmin, studentIds);
  const byStudent = new Map<string, ReportRecipient[]>();
  for (const recipient of recipients) {
    const list = byStudent.get(recipient.studentProfileId) || [];
    list.push(recipient);
    byStudent.set(recipient.studentProfileId, list);
  }
  return byStudent;
}

async function sendToRecipients(
  supabaseAdmin: SupabaseClient,
  studentProfileId: string,
  recipients: ReportRecipient[],
  buildDedupeKey: (parentProfileId: string, suffix?: string) => string,
  buildVariables: (studentName: string) => Record<string, string>,
  templateKey: "dailyReport" | "weeklyReport" | "monthlyReport",
  meta: Record<string, unknown>,
  options: ReportSendOptions,
): Promise<ReportSendResult> {
  if (recipients.length === 0) {
    return { studentProfileId, noParent: true, outcomes: [] };
  }

  const outcomes: ReportSendOutcome[] = [];
  for (const target of recipients) {
    const dedupeKey = buildDedupeKey(
      target.parentProfileId,
      options.dedupeSuffix,
    );
    const variables = buildVariables(target.studentName);

    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey,
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey,
      meta,
      variables,
    });

    outcomes.push({
      parentProfileId: target.parentProfileId,
      phone: target.parentPhone,
      status: outcome.status,
      ...(outcome.status === "failed" ? { reason: outcome.reason } : {}),
    });
  }

  return { studentProfileId, noParent: false, outcomes };
}

// ── 일간 ────────────────────────────────────────────────────────────────

export type DailyReportRecordLike = {
  study_hours?: number | null;
  target_ideal_hours?: number | null;
  target_min_hours?: number | null;
  tasks?: string[] | null;
  body_condition?: string | null;
  memo?: string | null;
} | null;

export type DailyReportInput = {
  studentProfileId: string;
  date: string;
  record: DailyReportRecordLike;
  plan: { total: number; done: number };
  recipients: ReportRecipient[];
};

export function buildDailyReportDedupeKey(
  parentProfileId: string,
  studentProfileId: string,
  date: string,
  suffix?: string,
): string {
  const base = `dailyReport:${parentProfileId}:${studentProfileId}:${date}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function buildDailyReportVariables(params: {
  studentName: string;
  date: string;
  record: DailyReportRecordLike;
  plan: { total: number; done: number };
}): Record<string, string> {
  const { studentName, date, record, plan } = params;
  const [, month, day] = date.split("-");

  const doneText =
    (record?.tasks || [])
      .filter(Boolean)
      .map((code) => TASK_LABELS[code as keyof typeof TASK_LABELS] || code)
      .join(", ") || "기록된 완료 항목이 없습니다.";

  return {
    학생명: studentName,
    월: String(Number(month)),
    일: String(Number(day)),
    이상목표시간: formatHours(record?.target_ideal_hours),
    최소목표시간: formatHours(record?.target_min_hours),
    실제학습시간: formatHours(record?.study_hours),
    이상달성률: String(
      achievementRate(record?.study_hours, record?.target_ideal_hours),
    ),
    최소달성률: String(
      achievementRate(record?.study_hours, record?.target_min_hours),
    ),
    오늘완료내용: doneText,
    전체계획수: String(plan.total),
    달성계획수: String(plan.done),
    오늘컨디션:
      CONDITION_LABELS[String(record?.body_condition || "")] || "기록 없음",
    학생한마디: record?.memo || "오늘도 수고했습니다.",
  };
}

/**
 * 일간 리포트 발송 입력을 배치로 조회한다.
 *
 * @param studentIds null이면(크론) date에 기록이 있는 학생을 직접 찾는다 —
 *   원래 크론의 단일 쿼리(기록 조회가 곧 대상 학생 발견)와 동일하다. 배열이면
 *   (관리자 재발송) 그 학생들만 조회한다 — 기록이 없어도 항목은 만들어진다
 *   (record: null, "기록 없어도 재발송 허용" 요구사항).
 */
export async function loadDailyReportInputs(
  supabaseAdmin: SupabaseClient,
  studentIds: string[] | null,
  date: string,
): Promise<Map<string, DailyReportInput>> {
  let recordQuery = supabaseAdmin
    .from("goal_daily_records")
    .select(
      "profile_id, study_hours, target_ideal_hours, target_min_hours, tasks, body_condition, memo",
    )
    .eq("record_date", date);
  if (studentIds) {
    recordQuery = recordQuery.in("profile_id", studentIds);
  }
  const { data: recordRows, error: recordError } = await recordQuery;
  if (recordError) {
    // 원래 크론(daily-report.ts)이 이 조회 실패를 500으로 끊었다 — defineHandler의
    // 최상위 catch가 받아 같은 결과(500)를 낸다. 다만 원본이 실었던 원문
    // error.message는 여기선 싣지 못한다(호출부가 cron·재발송 둘이라 응답 모양이
    // 라우트마다 다르다 — 라우트별 unhandledMessage로 통일하는 편이 안전하다).
    throw new Error(`goal_daily_records 조회 실패: ${recordError.message}`);
  }
  const rows = recordRows || [];

  const targetIds =
    studentIds ??
    Array.from(
      new Set(
        rows.map((row: { profile_id: unknown }) => String(row.profile_id)),
      ),
    );

  if (targetIds.length === 0) {
    return new Map();
  }

  // 계획 달성(goal_plan_tasks)·수신자(resolveParentRecipients)는 학생 수와
  // 무관하게 각각 한 번씩만 돈다 — 학생별로 다시 조회하지 않는다.
  const [{ data: planTasks, error: planError }, recipientsByStudent] =
    await Promise.all([
      supabaseAdmin
        .from("goal_plan_tasks")
        .select("profile_id, done")
        .eq("plan_date", date)
        .in("profile_id", targetIds),
      groupRecipientsByStudent(supabaseAdmin, targetIds),
    ]);
  // 원본과 같은 완화 정책 — 계획 조회 실패는 전체 발송을 막지 않는다(전체계획수
  // 0으로 보내는 편이, 학부모 전원에게 "리포트 미발송"보다 낫다).
  if (planError) {
    console.error("goal_plan_tasks 조회 실패:", planError);
  }

  const recordByStudent = new Map<string, DailyReportRecordLike>();
  for (const row of rows) {
    recordByStudent.set(
      String((row as { profile_id: unknown }).profile_id),
      row as DailyReportRecordLike,
    );
  }

  const planStat = new Map<string, { total: number; done: number }>();
  for (const task of planTasks || []) {
    const key = String(task.profile_id);
    const stat = planStat.get(key) || { total: 0, done: 0 };
    stat.total += 1;
    if (task.done) stat.done += 1;
    planStat.set(key, stat);
  }

  const inputs = new Map<string, DailyReportInput>();
  for (const studentId of targetIds) {
    inputs.set(studentId, {
      studentProfileId: studentId,
      date,
      record: recordByStudent.get(studentId) || null,
      plan: planStat.get(studentId) || { total: 0, done: 0 },
      recipients: recipientsByStudent.get(studentId) || [],
    });
  }
  return inputs;
}

/** loadDailyReportInputs가 만든 입력 하나로 sendAndLog만 부른다(DB 조회 없음). */
export async function sendDailyReport(
  supabaseAdmin: SupabaseClient,
  input: DailyReportInput,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const { studentProfileId, date, record, plan, recipients } = input;
  return sendToRecipients(
    supabaseAdmin,
    studentProfileId,
    recipients,
    (parentProfileId, suffix) =>
      buildDailyReportDedupeKey(
        parentProfileId,
        studentProfileId,
        date,
        suffix,
      ),
    (studentName) =>
      buildDailyReportVariables({ studentName, date, record, plan }),
    "dailyReport",
    { studentProfileId, date },
    options,
  );
}

// ── 주간 ────────────────────────────────────────────────────────────────

export type WeeklyReportInput = {
  studentProfileId: string;
  weekStart: string;
  recipients: ReportRecipient[];
};

export function buildWeeklyReportDedupeKey(
  parentProfileId: string,
  studentProfileId: string,
  weekStart: string,
  suffix?: string,
): string {
  const base = `weeklyReport:${parentProfileId}:${studentProfileId}:${weekStart}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function buildWeeklyReportVariables(params: {
  studentName: string;
  weekStart: string;
  studentProfileId: string;
}): Record<string, string> {
  const { studentName, weekStart, studentProfileId } = params;
  const monday = new Date(`${weekStart}T00:00:00Z`);
  const month = monday.getUTCMonth() + 1;
  const nth = weekOfMonth(monday);

  return {
    학생명: studentName,
    N월: String(month),
    N주차: String(nth),
    // reportId = <주간 키(그 주 월요일 YMD)>_<학생 profile id> — weekly-report.ts
    // 원본과 동일 규칙(구분자는 '_', src/routes/alimtalkLinkRoutes.tsx parseReportId).
    reportId: `${weekStart}_${studentProfileId}`,
  };
}

/**
 * 주간 리포트 발송 입력을 배치로 조회한다.
 *
 * @param studentIds null이면(크론) 그 주에 기록이 있는 학생을 직접 찾는다.
 *   배열이면(관리자 재발송) 그 학생들만 조회한다 — "그 주에 기록이 있었는지"는
 *   보지 않는다(재발송은 안내 목적이라 기록 유무와 무관하게 허용).
 */
export async function loadWeeklyReportInputs(
  supabaseAdmin: SupabaseClient,
  studentIds: string[] | null,
  weekStart: string,
): Promise<Map<string, WeeklyReportInput>> {
  const weekEnd = toYmd(
    new Date(
      new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 24 * 60 * 60 * 1000,
    ),
  );

  let targetIds = studentIds;
  if (!targetIds) {
    const { data: rows, error } = await supabaseAdmin
      .from("goal_daily_records")
      .select("profile_id")
      .gte("record_date", weekStart)
      .lte("record_date", weekEnd);
    if (error) {
      throw new Error(`goal_daily_records 조회 실패: ${error.message}`);
    }
    targetIds = Array.from(
      new Set((rows || []).map((row) => String(row.profile_id))),
    );
  }

  if (targetIds.length === 0) {
    return new Map();
  }

  const recipientsByStudent = await groupRecipientsByStudent(
    supabaseAdmin,
    targetIds,
  );

  const inputs = new Map<string, WeeklyReportInput>();
  for (const studentId of targetIds) {
    inputs.set(studentId, {
      studentProfileId: studentId,
      weekStart,
      recipients: recipientsByStudent.get(studentId) || [],
    });
  }
  return inputs;
}

/** loadWeeklyReportInputs가 만든 입력 하나로 sendAndLog만 부른다(DB 조회 없음). */
export async function sendWeeklyReport(
  supabaseAdmin: SupabaseClient,
  input: WeeklyReportInput,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const { studentProfileId, weekStart, recipients } = input;
  const weekEnd = toYmd(
    new Date(
      new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 24 * 60 * 60 * 1000,
    ),
  );

  return sendToRecipients(
    supabaseAdmin,
    studentProfileId,
    recipients,
    (parentProfileId, suffix) =>
      buildWeeklyReportDedupeKey(
        parentProfileId,
        studentProfileId,
        weekStart,
        suffix,
      ),
    (studentName) =>
      buildWeeklyReportVariables({ studentName, weekStart, studentProfileId }),
    "weeklyReport",
    { studentProfileId, weekStart, weekEnd },
    options,
  );
}

// ── 월간 ────────────────────────────────────────────────────────────────

export type MonthlyReportInput = {
  studentProfileId: string;
  monthKey: string;
  recipients: ReportRecipient[];
};

export function buildMonthlyReportDedupeKey(
  parentProfileId: string,
  studentProfileId: string,
  monthKey: string,
  suffix?: string,
): string {
  const base = `monthlyReport:${parentProfileId}:${studentProfileId}:${monthKey}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function buildMonthlyReportVariables(params: {
  studentName: string;
  monthKey: string;
  studentProfileId: string;
}): Record<string, string> {
  const { studentName, monthKey, studentProfileId } = params;
  const month = Number(monthKey.split("-")[1]);

  return {
    학생명: studentName,
    N월: String(month),
    // reportId = <월간 키('YYYY-MM')>_<학생 profile id> — monthly-report.ts 원본과
    // 동일 규칙(구분자는 '_').
    reportId: `${monthKey}_${studentProfileId}`,
  };
}

/**
 * 월간 리포트 발송 입력을 배치로 조회한다.
 *
 * @param studentIds null이면(크론) 그 달에 기록이 있는 학생을 직접 찾는다.
 *   배열이면(관리자 재발송) 그 학생들만 조회한다.
 */
export async function loadMonthlyReportInputs(
  supabaseAdmin: SupabaseClient,
  studentIds: string[] | null,
  monthKey: string,
): Promise<Map<string, MonthlyReportInput>> {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const monthStart = `${monthKey}-01`;
  const monthEnd = toYmd(new Date(Date.UTC(year, month, 0)));

  let targetIds = studentIds;
  if (!targetIds) {
    const { data: rows, error } = await supabaseAdmin
      .from("goal_daily_records")
      .select("profile_id")
      .gte("record_date", monthStart)
      .lte("record_date", monthEnd);
    if (error) {
      throw new Error(`goal_daily_records 조회 실패: ${error.message}`);
    }
    targetIds = Array.from(
      new Set((rows || []).map((row) => String(row.profile_id))),
    );
  }

  if (targetIds.length === 0) {
    return new Map();
  }

  const recipientsByStudent = await groupRecipientsByStudent(
    supabaseAdmin,
    targetIds,
  );

  const inputs = new Map<string, MonthlyReportInput>();
  for (const studentId of targetIds) {
    inputs.set(studentId, {
      studentProfileId: studentId,
      monthKey,
      recipients: recipientsByStudent.get(studentId) || [],
    });
  }
  return inputs;
}

/** loadMonthlyReportInputs가 만든 입력 하나로 sendAndLog만 부른다(DB 조회 없음). */
export async function sendMonthlyReport(
  supabaseAdmin: SupabaseClient,
  input: MonthlyReportInput,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const { studentProfileId, monthKey, recipients } = input;
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const monthStart = `${monthKey}-01`;
  const monthEnd = toYmd(new Date(Date.UTC(year, month, 0)));

  return sendToRecipients(
    supabaseAdmin,
    studentProfileId,
    recipients,
    (parentProfileId, suffix) =>
      buildMonthlyReportDedupeKey(
        parentProfileId,
        studentProfileId,
        monthKey,
        suffix,
      ),
    (studentName) =>
      buildMonthlyReportVariables({ studentName, monthKey, studentProfileId }),
    "monthlyReport",
    { studentProfileId, month: monthKey, monthStart, monthEnd },
    options,
  );
}
