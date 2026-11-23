// 매출 총괄 대시보드 집계 (QA 274, 파일18 「위닝에듀 정산관리」 기준).
//
// 화면(RevenueAdmin)에서 떼어낸 이유는 하나다 — 이 계산이 틀리면 **틀린 줄
// 모른다.** 합계·비율은 그럴듯한 숫자가 나오므로 눈으로는 검증이 안 되고,
// 브라우저를 띄워야만 확인할 수 있으면 아무도 확인하지 않는다.
//
// 원천은 admin_revenue_items 뷰 한 개다. 주문 단위 할인 안분과 환불 차감은 그
// 뷰가 이미 끝냈으므로(20260823000011) 여기서는 더하기만 한다.
//
// ⚠️ 매출은 net_amount 합이다(사용자 확정 2026-08-23). 환불은 "승인"이 아니라
//    실제 환불 완료 기준이고, 그 판정도 뷰가 마쳤다.

import { ymdIn } from "./time/day";

export type RevenueRowLike = {
  paid_at: string | null;
  item_name: string | null;
  list_amount: number | null;
  discount_amount: number | null;
  paid_amount: number | null;
  refunded_amount: number | null;
  net_amount: number | null;
};

const num = (value: number | null | undefined) => Number(value ?? 0);
const sum = (rows: RevenueRowLike[], pick: (row: RevenueRowLike) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

/** 0으로 나누기를 피한 백분율. 분모가 0이면 0%다("무한대"보다 낫다). */
export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export type RevenueKpi = {
  key: string;
  label: string;
  value: number;
  sub: string;
  tone: "primary" | "warning" | "info" | "danger" | "success";
};

/** 파일18 상단 KPI 5칸. 라벨·부연 문구까지 원본을 따른다. */
export function buildRevenueKpis(
  rows: RevenueRowLike[],
  refundedCount: number,
): RevenueKpi[] {
  const totalSales = sum(rows, (row) => num(row.list_amount));
  const totalDiscount = sum(rows, (row) => num(row.discount_amount));
  const totalPaid = sum(rows, (row) => num(row.paid_amount));
  const totalRefund = sum(rows, (row) => num(row.refunded_amount));

  return [
    {
      key: "sales",
      label: "총 판매금액",
      value: totalSales,
      sub: `${rows.length.toLocaleString()}건 결제`,
      tone: "primary",
    },
    {
      key: "discount",
      label: "감면액 합계",
      value: totalDiscount,
      sub: `판매금액 대비 ${percent(totalDiscount, totalSales)}%`,
      tone: "warning",
    },
    {
      key: "paid",
      label: "실 납부금액",
      value: totalPaid,
      sub: "감면 반영 후 금액",
      tone: "info",
    },
    {
      key: "refund",
      label: "환불금액 합계",
      value: totalRefund,
      sub: `${refundedCount.toLocaleString()}건 환불 처리`,
      tone: "danger",
    },
    {
      key: "net",
      label: "순매출액",
      // 뷰가 이미 차감을 마친 net_amount 를 더한다 — totalPaid - totalRefund 로
      // 다시 계산하지 않는다. 두 경로가 갈라지면 어느 쪽이 정본인지 알 수 없다.
      value: sum(rows, (row) => num(row.net_amount)),
      sub: `환불율 ${percent(totalRefund, totalPaid)}%`,
      tone: "success",
    },
  ];
}

export type DailyTrendPoint = { ymd: string; paid: number; refund: number };

/**
 * 일별 실납부·환불 추이. 날짜는 넘겨받은 시간대(보는 사람의 브라우저 시간대)
 * 기준이다 — UTC 로 자르면 한국에서는 매일 09:00 이전 결제가 전날로 밀린다.
 */
export function buildDailyTrend(
  rows: RevenueRowLike[],
  timeZone: string,
): DailyTrendPoint[] {
  const byDay = new Map<string, DailyTrendPoint>();

  for (const row of rows) {
    if (!row.paid_at) continue;
    const ymd = ymdIn(row.paid_at, timeZone);
    const point = byDay.get(ymd) ?? { ymd, paid: 0, refund: 0 };
    point.paid += num(row.paid_amount);
    point.refund += num(row.refunded_amount);
    byDay.set(ymd, point);
  }

  return [...byDay.values()].sort((a, b) => a.ymd.localeCompare(b.ymd));
}

export type ProgramShare = { name: string; amount: number; pct: number };

/** 프로그램별 실납부 비중. 금액 큰 순. */
export function buildProgramShare(rows: RevenueRowLike[]): ProgramShare[] {
  const byProgram = new Map<string, number>();

  for (const row of rows) {
    const name = (row.item_name || "").trim() || "(이름 없음)";
    byProgram.set(name, (byProgram.get(name) ?? 0) + num(row.paid_amount));
  }

  const total = [...byProgram.values()].reduce((a, b) => a + b, 0);

  return [...byProgram.entries()]
    .map(([name, amount]) => ({ name, amount, pct: percent(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

export type SummaryRow = { label: string; count: number; amount: number };

/**
 * 항목별 집계 요약. 파일18은 5행(매출조정·매출취소 포함)이지만 그 둘은 원장
 * 자체가 없어(수기 조정 화면은 2026-08-23 에 삭제) 여기서는 3행만 낸다.
 * 원장이 생기면 행을 더한다 — 없는 숫자를 0으로 지어내지 않는다.
 */
export function buildSummaryRows(rows: RevenueRowLike[]): SummaryRow[] {
  const discounted = rows.filter((row) => num(row.discount_amount) > 0);
  const refunded = rows.filter((row) => num(row.refunded_amount) > 0);

  return [
    {
      label: "총 매출 건수",
      count: rows.length,
      amount: sum(rows, (row) => num(row.list_amount)),
    },
    {
      label: "감면 적용 건수",
      count: discounted.length,
      amount: sum(discounted, (row) => num(row.discount_amount)),
    },
    {
      label: "환불 처리 건수",
      count: refunded.length,
      amount: sum(refunded, (row) => num(row.refunded_amount)),
    },
  ];
}
