// 목표관리 리포트 알림톡 — "학생 1명분 발송"을 크론 3종(일간·주간·월간)과
// 관리자 재발송(api/goal/admin/resend-report.ts)이 공유하는 부분.
//
// 왜 뽑았는가
//   크론마다 인라인으로 있던 "기간 계산 → 기록 조회 → 수신자 → 변수 조립 →
//   sendAndLog" 중 "학생 1명분" 단위를 여기로 뽑는다. 관리자 재발송은 크론처럼
//   날짜 전체를 훑을 필요가 없고 특정 학생 1명에게만 다시 보내면 되므로, 그
//   경계가 자연스러운 재사용 지점이다.
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
  resolveParentRecipients,
  toYmd,
  weekOfMonth,
} from "./goalReportNotify.js";

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

// ── 일간 ────────────────────────────────────────────────────────────────

export type DailyReportRecordLike = {
  study_hours?: number | null;
  target_ideal_hours?: number | null;
  target_min_hours?: number | null;
  tasks?: string[] | null;
  body_condition?: string | null;
  memo?: string | null;
} | null;

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

/** 학생 1명 · 하루치 일간 리포트 알림톡을 그 학생의 연결된 학부모 전원에게 보낸다. */
export async function sendDailyReportFor(
  supabaseAdmin: SupabaseClient,
  studentProfileId: string,
  date: string,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const recipients = await resolveParentRecipients(supabaseAdmin, [
    studentProfileId,
  ]);
  if (recipients.length === 0) {
    return { studentProfileId, noParent: true, outcomes: [] };
  }

  const { data: record } = await supabaseAdmin
    .from("goal_daily_records")
    .select(
      "study_hours, target_ideal_hours, target_min_hours, tasks, body_condition, memo",
    )
    .eq("profile_id", studentProfileId)
    .eq("record_date", date)
    .maybeSingle();

  const { data: planTasks } = await supabaseAdmin
    .from("goal_plan_tasks")
    .select("done")
    .eq("plan_date", date)
    .eq("profile_id", studentProfileId);

  const plan = {
    total: (planTasks || []).length,
    done: (planTasks || []).filter(
      (task: { done?: boolean | null }) => task.done,
    ).length,
  };

  const outcomes: ReportSendOutcome[] = [];
  for (const target of recipients) {
    const dedupeKey = buildDailyReportDedupeKey(
      target.parentProfileId,
      studentProfileId,
      date,
      options.dedupeSuffix,
    );
    const variables = buildDailyReportVariables({
      studentName: target.studentName,
      date,
      record: (record as DailyReportRecordLike) || null,
      plan,
    });

    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "dailyReport",
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey,
      meta: { studentProfileId, date },
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

// ── 주간 ────────────────────────────────────────────────────────────────

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

/** 학생 1명분 주간 리포트 발행 안내 알림톡을 그 학생의 연결된 학부모 전원에게 보낸다. */
export async function sendWeeklyReportFor(
  supabaseAdmin: SupabaseClient,
  studentProfileId: string,
  weekStart: string,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const recipients = await resolveParentRecipients(supabaseAdmin, [
    studentProfileId,
  ]);
  if (recipients.length === 0) {
    return { studentProfileId, noParent: true, outcomes: [] };
  }

  const weekEnd = toYmd(
    new Date(
      new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 24 * 60 * 60 * 1000,
    ),
  );

  const outcomes: ReportSendOutcome[] = [];
  for (const target of recipients) {
    const dedupeKey = buildWeeklyReportDedupeKey(
      target.parentProfileId,
      studentProfileId,
      weekStart,
      options.dedupeSuffix,
    );
    const variables = buildWeeklyReportVariables({
      studentName: target.studentName,
      weekStart,
      studentProfileId,
    });

    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "weeklyReport",
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey,
      meta: { studentProfileId, weekStart, weekEnd },
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

// ── 월간 ────────────────────────────────────────────────────────────────

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

/** 학생 1명분 월간 리포트 발행 안내 알림톡을 그 학생의 연결된 학부모 전원에게 보낸다. */
export async function sendMonthlyReportFor(
  supabaseAdmin: SupabaseClient,
  studentProfileId: string,
  monthKey: string,
  options: ReportSendOptions = {},
): Promise<ReportSendResult> {
  const recipients = await resolveParentRecipients(supabaseAdmin, [
    studentProfileId,
  ]);
  if (recipients.length === 0) {
    return { studentProfileId, noParent: true, outcomes: [] };
  }

  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const monthStart = `${monthKey}-01`;
  const monthEnd = toYmd(new Date(Date.UTC(year, month, 0)));

  const outcomes: ReportSendOutcome[] = [];
  for (const target of recipients) {
    const dedupeKey = buildMonthlyReportDedupeKey(
      target.parentProfileId,
      studentProfileId,
      monthKey,
      options.dedupeSuffix,
    );
    const variables = buildMonthlyReportVariables({
      studentName: target.studentName,
      monthKey,
      studentProfileId,
    });

    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "monthlyReport",
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey,
      meta: { studentProfileId, month: monthKey, monthStart, monthEnd },
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
