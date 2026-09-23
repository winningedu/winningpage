// GoalStudentsAdmin "리포트 알림톡 다시 보내기" 섹션의 기간 select 후보 계산.
//
// api/goal/admin/resend-report.ts 의 validateResendPeriod 가 서버측 최종
// 판정이다 — 여기서는 그 규칙을 미리 적용해 "눌러도 어차피 400 나는" 후보를
// 아예 안 보여준다. 기준일(=그 기간이 실제로 자동 발송되는 날짜)과 14일 상수는
// 의존이 0에 가까운 잎 모듈(api/_lib/goalReportResendPolicy.ts) 값을 그대로
// 가져다 쓴다 — api/_lib/goalReportSend.ts를 직접 import하면 sendAndLog가
// 딸고 오는 aligo.ts(undici) 같은 서버 전용 의존까지 이 화면 번들에 끌려온다
// (api/_lib/performance/submission-chars.ts와 같은 원칙).
//
// "이번 주"·"이번 달"이 목록에 거의 안 보이는 이유
//   주간·월간 리포트는 기간이 끝난 뒤(주간=다음 월요일, 월간=그 달 마지막 날)에야
//   자동 발송된다. 그 발송일이 아직 안 지났으면 재발송할 대상 자체가 없다 —
//   그래서 "이번 주"는 그 주 월요일이 오기 전까지, "이번 달"은 그 달 마지막
//   날이 오기 전까지 후보에 없다(서버 규칙과 동일, 자연스러운 결과다).

import {
  addDaysYMD,
  diffDaysYMD,
  getMondayYMD,
  kstYMD,
} from "@/lib/goal/calc/index.js";
import {
  MAX_RESEND_DAYS_AGO,
  monthlyReportDispatchYmd,
  weeklyReportDispatchYmd,
} from "../../../api/_lib/goalReportResendPolicy.js";

export type ResendKind = "daily" | "weekly" | "monthly";

export type ResendCandidate = {
  periodKey: string;
  /** select 옵션에 붙일 상대 표기("오늘"/"지난 주"/"이번 달" 등). */
  label: string;
};

/** 오늘부터 13일 전까지, 최근순 14개(=MAX_RESEND_DAYS_AGO 이내 전량). */
export function listDailyResendCandidates(
  todayYmd: string = kstYMD(),
): ResendCandidate[] {
  const items: ResendCandidate[] = [];
  for (let i = 0; i < MAX_RESEND_DAYS_AGO; i++) {
    const periodKey = addDaysYMD(todayYmd, -i);
    const label = i === 0 ? "오늘" : i === 1 ? "어제" : `${i}일 전`;
    items.push({ periodKey, label });
  }
  return items;
}

/**
 * 지난 주·전전 주·3주 전 월요일 중, 그 주의 발송일(다음 월요일)이 이미 지났고
 * 14일 규칙을 통과하는 것만(최근순). "이번 주"는 발송일이 항상 미래라 후보에
 * 없다.
 */
export function listWeeklyResendCandidates(
  todayYmd: string = kstYMD(),
): ResendCandidate[] {
  const thisMonday = getMondayYMD(todayYmd);
  const raw: ResendCandidate[] = [
    { periodKey: addDaysYMD(thisMonday, -7), label: "지난 주" },
    { periodKey: addDaysYMD(thisMonday, -14), label: "전전 주" },
    { periodKey: addDaysYMD(thisMonday, -21), label: "3주 전" },
  ];

  return raw.filter(({ periodKey }) => {
    const diff = diffDaysYMD(weeklyReportDispatchYmd(periodKey), todayYmd);
    return diff >= 0 && diff <= MAX_RESEND_DAYS_AGO;
  });
}

/**
 * 이번 달·지난 달 중, 그 달의 발송일(그 달 마지막 날)이 이미 지났고 14일
 * 규칙을 통과하는 것만(최근순). "이번 달"은 그 달 마지막 날이 아니고서는
 * 후보에 없다 — 실무에서는 매월 1~14일에 "지난 달"만 뜨고 15일 이후엔
 * 후보가 아예 없는 게 정상이다.
 */
export function listMonthlyResendCandidates(
  todayYmd: string = kstYMD(),
): ResendCandidate[] {
  const thisMonthKey = todayYmd.slice(0, 7);
  const thisMonthStart = `${thisMonthKey}-01`;
  const lastMonthKey = addDaysYMD(thisMonthStart, -1).slice(0, 7);

  const raw: ResendCandidate[] = [
    { periodKey: thisMonthKey, label: "이번 달" },
    { periodKey: lastMonthKey, label: "지난 달" },
  ];

  return raw.filter(({ periodKey }) => {
    const diff = diffDaysYMD(monthlyReportDispatchYmd(periodKey), todayYmd);
    return diff >= 0 && diff <= MAX_RESEND_DAYS_AGO;
  });
}

/** GoalStudentsAdmin 섹션이 kind select 값 하나로 후보 목록을 고를 때 쓰는 진입점. */
export function listResendCandidates(
  kind: ResendKind,
  todayYmd: string = kstYMD(),
): ResendCandidate[] {
  if (kind === "daily") return listDailyResendCandidates(todayYmd);
  if (kind === "weekly") return listWeeklyResendCandidates(todayYmd);
  return listMonthlyResendCandidates(todayYmd);
}
