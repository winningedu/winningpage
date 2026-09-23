// GoalStudentsAdmin "리포트 알림톡 다시 보내기" 섹션의 기간 select 후보 계산.
//
// api/goal/admin/resend-report.ts 의 validateResendPeriod 가 서버측 최종
// 판정이다 — 여기서는 그 규칙(기간 시작이 오늘(KST) 기준 14일 이내)을 미리
// 적용해 "눌러도 어차피 400 나는" 후보를 아예 안 보여준다. MAX_RESEND_DAYS_AGO
// 는 의존이 0인 잎 모듈(api/_lib/goalReportResendPolicy.ts) 값 하나를 그대로
// 가져다 쓴다 — api/_lib/goalReportSend.ts를 직접 import하면 sendAndLog가
// 딸고 오는 aligo.ts(undici) 같은 서버 전용 의존까지 이 화면 번들에 끌려온다
// (api/_lib/performance/submission-chars.ts와 같은 원칙).

import {
  addDaysYMD,
  diffDaysYMD,
  getMondayYMD,
  kstYMD,
} from "@/lib/goal/calc/index.js";
import { MAX_RESEND_DAYS_AGO } from "../../../api/_lib/goalReportResendPolicy.js";

/** 오늘부터 13일 전까지, 최근순 14개(=MAX_RESEND_DAYS_AGO 이내 전량). */
export function listDailyResendCandidates(
  todayYmd: string = kstYMD(),
): string[] {
  const days: string[] = [];
  for (let i = 0; i < MAX_RESEND_DAYS_AGO; i++) {
    days.push(addDaysYMD(todayYmd, -i));
  }
  return days;
}

/**
 * 이번 주·지난 주·그 전 주 월요일 중 14일 규칙을 통과하는 것만(최근순).
 * 오늘이 월요일이면 3개, 그 밖에는 보통 2개가 남는다.
 */
export function listWeeklyResendCandidates(
  todayYmd: string = kstYMD(),
): string[] {
  const thisMonday = getMondayYMD(todayYmd);
  const candidates = [
    thisMonday,
    addDaysYMD(thisMonday, -7),
    addDaysYMD(thisMonday, -14),
  ];
  return candidates.filter(
    (monday) => diffDaysYMD(monday, todayYmd) <= MAX_RESEND_DAYS_AGO,
  );
}

/**
 * 이번 달·지난 달 중 14일 규칙(기간 시작 = 그 달 1일)을 통과하는 것만(최근순).
 * 지난 달 1일은 구조상 최소 28일 전이라 실제로는 이번 달만 남는 경우가
 * 대부분이다(달 초 며칠만 이번 달도 남는다).
 */
export function listMonthlyResendCandidates(
  todayYmd: string = kstYMD(),
): string[] {
  const thisMonthKey = todayYmd.slice(0, 7);
  const thisMonthStart = `${thisMonthKey}-01`;
  const lastMonthStart = addDaysYMD(thisMonthStart, -1)
    .slice(0, 7)
    .concat("-01");
  const lastMonthKey = lastMonthStart.slice(0, 7);

  const candidates = [
    { key: thisMonthKey, start: thisMonthStart },
    { key: lastMonthKey, start: lastMonthStart },
  ];

  return candidates
    .filter((c) => diffDaysYMD(c.start, todayYmd) <= MAX_RESEND_DAYS_AGO)
    .map((c) => c.key);
}

/** 일간 후보 옆에 붙일 상대 표기("오늘"/"어제"/"N일 전"). */
export function formatDailyResendOptionLabel(
  periodKey: string,
  todayYmd: string = kstYMD(),
): string {
  const diff = diffDaysYMD(periodKey, todayYmd);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}

const WEEKLY_OPTION_LABELS = ["이번 주", "지난 주", "전전 주"];
const MONTHLY_OPTION_LABELS = ["이번 달", "지난 달"];

/** listWeeklyResendCandidates 결과의 인덱스(최근순) → 상대 표기. */
export function formatWeeklyResendOptionLabel(index: number): string {
  return WEEKLY_OPTION_LABELS[index] ?? `${index}주 전`;
}

/** listMonthlyResendCandidates 결과의 인덱스(최근순) → 상대 표기. */
export function formatMonthlyResendOptionLabel(index: number): string {
  return MONTHLY_OPTION_LABELS[index] ?? `${index}달 전`;
}
