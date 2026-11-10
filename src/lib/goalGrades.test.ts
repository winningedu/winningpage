// QA 행288 회귀 테스트 — api/_routes/goal/grades.ts upsertRecord()가 회차를 배열 끝에 append하고
// latestKpi()/recentHistory()가 "배열 마지막 = 최신"으로 가정하던 시절엔, 회차를 시간순과
// 다르게 입력하면(예: 지난 시험을 나중에 추가) 증감이 뒤바뀌었다. sortByExamOrder()가 항상
// examDate/enteredAt(응시·입력 시점) 기준으로 다시 정렬하는지를 검증한다.

import { expect, test } from "vitest";
import { latestKpi, recentHistory, sortByExamOrder } from "./goalGrades.ts";

// 시간순으로는 3월 < 6월 < 9월이지만, 배열 순서(append 순서)는 뒤섞여 있다 —
// "9월을 먼저 입력하고 나중에 6월을 추가로 기록한" 상황을 재현한다.
const OUT_OF_ORDER_MOCK = [
  { term: "9월 모의고사", examDate: "2026-09-05", value: 88 },
  { term: "3월 모의고사", examDate: "2026-03-10", value: 70 },
  { term: "6월 모의고사", examDate: "2026-06-08", value: 80 },
];

const OUT_OF_ORDER_NAESIN = [
  { term: "고2 2학기 중간", enteredAt: "2026-10-01", value: 3.2 },
  { term: "고2 1학기 중간", enteredAt: "2026-04-01", value: 4.0 },
  { term: "고2 1학기 기말", enteredAt: "2026-07-01", value: 3.6 },
];

test("sortByExamOrder는 examDate 기준으로 회차를 자연 순서로 정렬한다", () => {
  const sorted = sortByExamOrder(OUT_OF_ORDER_MOCK);
  expect(sorted.map((r) => r.term)).toEqual([
    "3월 모의고사",
    "6월 모의고사",
    "9월 모의고사",
  ]);
});

test("sortByExamOrder는 enteredAt 기준으로도 정렬한다(내신, 자유 입력 term)", () => {
  const sorted = sortByExamOrder(OUT_OF_ORDER_NAESIN);
  expect(sorted.map((r) => r.term)).toEqual([
    "고2 1학기 중간",
    "고2 1학기 기말",
    "고2 2학기 중간",
  ]);
});

test("latestKpi는 배열 마지막이 아니라 응시 시점이 가장 늦은 회차를 최신으로 본다", () => {
  // 배열 순서상 마지막 원소는 6월(80)이지만, 실제 가장 최근 응시는 9월(88)이다.
  const kpi = latestKpi(OUT_OF_ORDER_MOCK);
  expect(kpi.round).toBe("9월 모의고사");
  expect(kpi.value).toBe(88);
  // 직전 대비 증감은 6월(80) → 9월(88) = +8이어야 한다(배열 순서 그대로였다면
  // "9월(마지막에서 두 번째, value 88이 아니라 3월 70과 비교) → 6월(80)" +10으로 잘못 나온다).
  expect(kpi.delta).toBe(8);
});

test("recentHistory는 응시 시점 최신순으로 정렬하고 직전 회차 대비 증감을 계산한다", () => {
  const history = recentHistory(OUT_OF_ORDER_MOCK, 3);
  expect(history.map((r) => r.term)).toEqual([
    "9월 모의고사",
    "6월 모의고사",
    "3월 모의고사",
  ]);
  // recentHistory 원소들은 정렬된 배열 기준 "직전(시간상 바로 앞) 회차 대비" 증감을 달고 있다.
  const bySeptember = history.find((r) => r.term === "9월 모의고사");
  expect(bySeptember?.delta).toBe(8); // 88 - 80
  const byMarch = history.find((r) => r.term === "3월 모의고사");
  expect(byMarch?.delta).toBeNull(); // 첫 회차, 비교 대상 없음
});
