// 성장 리포트 PDF 파일명(QA 행319) — `목표관리_{주간|월간}리포트_{YYYY-MM-DD|YYYY-MM}`.
//
// `useReactToPrint`의 `documentTitle`이 인쇄 다이얼로그 "PDF로 저장"의 기본 파일명이 된다
// (수행평가 쪽 선례 `ReportModalShell.tsx`/`reportFileName.ts`와 같은 이유). 여기 도메인은
// 그쪽과 조각 구성이 달라(주제/학생명 없음, 대신 "기간" 하나) 그 파일을 그대로 가져다
// 쓰지 않는다.
//
// 날짜 조각은 `api/_routes/goal/report.js`의 `resolveWeeklyPeriod`/`resolveMonthlyPeriod`
// (`src/lib/goal/report/aggregate.ts`)가 만드는 `periodLabel = "${start} ~ ${end}"`에서
// 뽑는다 — 서버 응답은 `periodKey`(주간은 그 주 월요일 YMD, 월간은 YYYY-MM)를 그대로
// 클라이언트에 내려주지 않으므로, 화면에 이미 있는 `periodLabel`의 시작일 토큰을
// 재사용한다(새 서버 필드를 만들지 않는다). 형식이 예상과 다르면(로딩 중이라
// periodLabel이 없거나, 파싱 실패) 그 조각을 통째로 뺀다 — 억지 값을 지어내지 않는다.

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function extractPeriodDateSegment(
  period: "weekly" | "monthly",
  periodLabel: string | null | undefined,
): string | null {
  if (!periodLabel) return null;
  const [start] = periodLabel.split(" ~ ");
  if (!start || !YMD_RE.test(start)) return null;
  return period === "monthly" ? start.slice(0, 7) : start;
}

export function buildGoalReportFileName(input: {
  period: "weekly" | "monthly";
  periodLabel?: string | null | undefined;
}): string {
  const reportName =
    input.period === "monthly" ? "목표관리_월간리포트" : "목표관리_주간리포트";
  const dateSegment = extractPeriodDateSegment(input.period, input.periodLabel);
  return dateSegment ? `${reportName}_${dateSegment}` : reportName;
}
