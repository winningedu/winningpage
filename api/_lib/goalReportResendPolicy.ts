// "자동 발송된 지 2주 안이면 다시 보낼 수 있다"(고객사 의도) — 관리자 재발송이
// 허용하는 기준. api/goal/admin/resend-report.ts(서버 검증)와
// src/components/admin/goalReportResendOptions.ts(관리자 화면의 기간 후보
// 계산) 양쪽이 이 파일 하나를 그대로 가져다 쓴다.
//
// 의존이 0에 가까운 잎 모듈이다(addDaysYMD 하나만 쓴다 — 그 자체가 Date.UTC
// 산술뿐인 순수 함수라 서버 전용 의존을 끌고 오지 않는다). api/_lib/goalReportSend.ts
// 처럼 sendAndLog(→ aligo.ts → undici)까지 딸려오는 모듈을 프론트 번들에
// 끌고 오지 않기 위해 상수·기준일 계산만 따로 뗐다
// (api/_lib/performance/submission-chars.ts와 같은 원칙).
//
// 기준일 = "기간 시작"이 아니라 "그 기간의 리포트가 실제로 자동 발송되는 날"이다.
//   daily   — 그날 저녁(22:00 KST, api/cron/daily-report.ts)에 나가므로 기준일은
//             periodKey 자신이다.
//   weekly  — 그 주가 끝난 다음 월요일 아침(08:00 KST, api/cron/weekly-report.ts)에
//             나가므로 기준일은 weekStart + 7일이다. 그래서 "이번 주"는 그 주의
//             월요일이 오기 전까지는 절대 재발송 후보가 될 수 없다(아직 자동
//             발송 자체가 안 일어났다).
//   monthly — 그 달 마지막 날 밤(23:00 KST, api/cron/monthly-report.ts)에 나가므로
//             기준일은 그 달의 마지막 날이다.
import { addDaysYMD } from "../../src/lib/goal/calc/virtualDate.js";

export const MAX_RESEND_DAYS_AGO = 14;

/** 일간 리포트(periodKey=YYYY-MM-DD)의 자동 발송일. */
export function dailyReportDispatchYmd(periodKey: string): string {
  return periodKey;
}

/** 주간 리포트(weekStart=그 주 월요일 YMD)의 자동 발송일 — 다음 주 월요일. */
export function weeklyReportDispatchYmd(weekStart: string): string {
  return addDaysYMD(weekStart, 7);
}

/** 월간 리포트(monthKey='YYYY-MM')의 자동 발송일 — 그 달의 마지막 날. */
export function monthlyReportDispatchYmd(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStart = `${String(nextYear).padStart(4, "0")}-${String(
    nextMonth,
  ).padStart(2, "0")}-01`;
  // 다음 달 1일에서 하루를 빼면 이번 달 마지막 날.
  return addDaysYMD(nextMonthStart, -1);
}

// QA — *DispatchYmd 함수들은 "날짜"까지만 알려준다. 재발송 검증(resend-report.ts)이
// 이 날짜만 보고 "오늘 = 발송일이면 통과"로 판정하면, 크론이 실제로 도는
// 시각(daily 22:00 · weekly 08:00 · monthly 23:00, 전부 KST) 전에도 재발송을
// 허용해 버린다 — 관리자가 재발송한 직후 크론이 또 자동 발송해 학부모가 2통을
// 받는 사고로 이어진다. dispatchAtKst는 그 시·분까지 포함한 발송 "시각" 하나를
// UTC Date로 돌려준다.
const DISPATCH_TIME_KST: Record<
  "daily" | "weekly" | "monthly",
  { hour: number; minute: number }
> = {
  daily: { hour: 22, minute: 0 },
  weekly: { hour: 8, minute: 0 },
  monthly: { hour: 23, minute: 0 },
};

/**
 * kind별 원본 periodKey(daily=날짜 자신, weekly=weekStart, monthly=monthKey)의
 * 자동 발송 시각을 KST 시·분까지 반영해 UTC Date로 변환한다.
 *
 * KST = UTC+9라 UTC 시는 KST 시에서 9를 뺀 값이다. Date.UTC는 그 값이 음수여도
 * (예: 08:00 KST → -1시) 알아서 전날로 굴려준다 — weekly가 그 경우다.
 */
export function dispatchAtKst(
  kind: "daily" | "weekly" | "monthly",
  periodKey: string,
): Date {
  const dispatchYmd =
    kind === "daily"
      ? dailyReportDispatchYmd(periodKey)
      : kind === "weekly"
        ? weeklyReportDispatchYmd(periodKey)
        : monthlyReportDispatchYmd(periodKey);

  const [year, month, day] = dispatchYmd.split("-").map(Number);
  const { hour, minute } = DISPATCH_TIME_KST[kind];
  return new Date(Date.UTC(year!, month! - 1, day!, hour - 9, minute, 0));
}
