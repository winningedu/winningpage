// 매출 총괄 대시보드 집계 회귀 테스트 (QA 274).
//
// 합계·비율은 틀려도 그럴듯한 숫자가 나와 눈으로 검증되지 않는다. 특히 셋을 잠근다:
//   1. 순매출액은 net_amount 합이다 — paid − refund 로 다시 계산하면 뷰의 안분·
//      환불 판정과 갈라져 어느 쪽이 정본인지 알 수 없게 된다.
//   2. 분모가 0일 때 비율은 0%다(NaN·Infinity 가 화면에 새면 안 된다).
//   3. 일별 추이는 넘겨받은 시간대 기준이다 — UTC 로 자르면 한국은 매일 09:00 이전 결제가 전날로 밀린다.

import { expect, test } from "vitest";
import {
  buildDailyTrend,
  buildProgramShare,
  buildRevenueKpis,
  buildSummaryRows,
  percent,
  type RevenueRowLike,
} from "./revenueDashboard";

const row = (over: Partial<RevenueRowLike> = {}): RevenueRowLike => ({
  paid_at: "2026-08-20T05:00:00Z",
  item_name: "목표관리",
  list_amount: 100000,
  discount_amount: 0,
  paid_amount: 100000,
  refunded_amount: 0,
  net_amount: 100000,
  ...over,
});

const SEOUL = "Asia/Seoul";
const LOS_ANGELES = "America/Los_Angeles";

test("순매출액은 net_amount 합이다 (paid − refund 재계산이 아니다)", () => {
  // 뷰가 안분·환불 판정을 마친 값과 단순 차감이 어긋나는 행을 일부러 만든다.
  const rows = [
    row({ paid_amount: 100000, refunded_amount: 30000, net_amount: 55000 }),
  ];

  const net = buildRevenueKpis(rows, 1).find((kpi) => kpi.key === "net");

  expect(net?.value).toBe(55000);
  expect(net?.value).not.toBe(70000);
});

test("KPI 5칸의 라벨과 값이 파일18 사양과 같다", () => {
  const rows = [
    row({ list_amount: 100000, discount_amount: 20000, paid_amount: 80000 }),
    row({
      list_amount: 100000,
      discount_amount: 0,
      paid_amount: 100000,
      refunded_amount: 100000,
      net_amount: 0,
    }),
  ];

  const kpis = buildRevenueKpis(rows, 1);

  expect(kpis.map((kpi) => kpi.label)).toEqual([
    "총 판매금액",
    "감면액 합계",
    "실 납부금액",
    "환불금액 합계",
    "순매출액",
  ]);
  expect(kpis[0]?.value).toBe(200000);
  expect(kpis[1]?.value).toBe(20000);
  expect(kpis[2]?.value).toBe(180000);
  expect(kpis[3]?.value).toBe(100000);
  expect(kpis[0]?.sub).toBe("2건 결제");
  expect(kpis[3]?.sub).toBe("1건 환불 처리");
});

test("분모가 0이면 비율은 0% — NaN·Infinity 가 새지 않는다", () => {
  expect(percent(0, 0)).toBe(0);
  expect(percent(5, 0)).toBe(0);

  const kpis = buildRevenueKpis([], 0);
  for (const kpi of kpis) {
    expect(kpi.sub).not.toMatch(/NaN|Infinity/);
    expect(kpi.value).toBe(0);
  }
});

test("일별 추이는 넘겨받은 시간대로 자른다", () => {
  // 2026-08-20T15:30Z = 서울 08-21 00:30 = 로스앤젤레스 08-20 08:30.
  const rows = [row({ paid_at: "2026-08-20T15:30:00Z", paid_amount: 1000 })];

  expect(buildDailyTrend(rows, SEOUL)[0]?.ymd).toBe("2026-08-21");
  expect(buildDailyTrend(rows, LOS_ANGELES)[0]?.ymd).toBe("2026-08-20");
});

test("일별 추이는 날짜순이고 실납부·환불을 따로 쌓는다", () => {
  const trend = buildDailyTrend(
    [
      row({ paid_at: "2026-08-22T05:00:00Z", paid_amount: 300 }),
      row({ paid_at: "2026-08-20T05:00:00Z", paid_amount: 100 }),
      row({
        paid_at: "2026-08-20T06:00:00Z",
        paid_amount: 200,
        refunded_amount: 50,
      }),
    ],
    SEOUL,
  );

  expect(trend.map((point) => point.ymd)).toEqual(["2026-08-20", "2026-08-22"]);
  expect(trend[0]).toMatchObject({ paid: 300, refund: 50 });
});

test("결제일시가 없는 행은 추이에서 제외한다", () => {
  expect(buildDailyTrend([row({ paid_at: null })], SEOUL)).toEqual([]);
});

test("프로그램별 비중은 금액 큰 순이고 합이 100%에 수렴한다", () => {
  const share = buildProgramShare([
    row({ item_name: "목표관리", paid_amount: 300 }),
    row({ item_name: "수행평가", paid_amount: 700 }),
  ]);

  expect(share.map((entry) => entry.name)).toEqual(["수행평가", "목표관리"]);
  expect(share[0]?.pct).toBe(70);
  expect(share[1]?.pct).toBe(30);
});

test("프로그램 이름이 비면 '(이름 없음)'으로 묶는다", () => {
  const share = buildProgramShare([
    row({ item_name: null, paid_amount: 100 }),
    row({ item_name: "  ", paid_amount: 100 }),
  ]);

  expect(share).toHaveLength(1);
  expect(share[0]?.name).toBe("(이름 없음)");
  expect(share[0]?.amount).toBe(200);
});

test("집계 요약은 원장이 있는 3행만 낸다", () => {
  const rows = [
    row({ discount_amount: 5000 }),
    row({ refunded_amount: 1000 }),
    row(),
  ];

  const summary = buildSummaryRows(rows);

  // 파일18 은 5행이지만 매출조정·매출취소는 원장 자체가 없다(수기 조정 화면은
  // 2026-08-23 삭제). 없는 숫자를 0으로 지어내지 않는다.
  expect(summary.map((entry) => entry.label)).toEqual([
    "총 매출 건수",
    "감면 적용 건수",
    "환불 처리 건수",
  ]);
  expect(summary[1]).toMatchObject({ count: 1, amount: 5000 });
  expect(summary[2]).toMatchObject({ count: 1, amount: 1000 });
});
