import { describe, expect, test } from "vitest";
import {
  formatDailyResendOptionLabel,
  formatMonthlyResendOptionLabel,
  formatWeeklyResendOptionLabel,
  listDailyResendCandidates,
  listMonthlyResendCandidates,
  listWeeklyResendCandidates,
} from "./goalReportResendOptions";

describe("listDailyResendCandidates", () => {
  test("오늘부터 13일 전까지 최근순 14개를 돌려준다", () => {
    const result = listDailyResendCandidates("2026-09-23");
    expect(result).toHaveLength(14);
    expect(result[0]).toBe("2026-09-23");
    expect(result[13]).toBe("2026-09-10");
  });
});

describe("listWeeklyResendCandidates", () => {
  test("주 중반(수요일)이면 이번 주·지난 주 월요일 2개만 남는다", () => {
    // 2026-09-23은 수요일. 이번 주 월요일 09-21, 지난 주 09-14는 diff 9일로
    // 통과하지만 그 전 주 09-07은 diff 16일이라 걸러진다.
    const result = listWeeklyResendCandidates("2026-09-23");
    expect(result).toEqual(["2026-09-21", "2026-09-14"]);
  });

  test("오늘이 월요일이면 3주 전 월요일까지 3개가 남는다", () => {
    // 2026-09-21은 월요일. diff: 0, 7, 14 — 셋 다 14 이내.
    const result = listWeeklyResendCandidates("2026-09-21");
    expect(result).toEqual(["2026-09-21", "2026-09-14", "2026-09-07"]);
  });
});

describe("listMonthlyResendCandidates", () => {
  test("달 초(14일 이내)면 이번 달·지난 달이 모두 남는다", () => {
    // 2026-09-10 기준 이번 달(09-01) diff=9, 지난 달(08-01) diff=40 → 지난 달은 걸러짐
    const result = listMonthlyResendCandidates("2026-09-10");
    expect(result).toEqual(["2026-09"]);
  });

  test("달 후반이면 이번 달도 걸러져 후보가 비어 있을 수 있다", () => {
    // 2026-09-23 기준 이번 달 1일(09-01) diff=22 > 14 → 제외, 지난 달은 더 멀다.
    const result = listMonthlyResendCandidates("2026-09-23");
    expect(result).toEqual([]);
  });

  test("월 1일이면 이번 달만 남는다(지난 달은 최소 28일 전이라 항상 걸러진다)", () => {
    // 지난 달 1일은 오늘(이번 달 1일)로부터 최소 28일 전이라 14일 규칙을 절대
    // 통과하지 못한다 — "지난 달" 후보가 실제로 남는 경우는 구조상 없다.
    const result = listMonthlyResendCandidates("2026-09-01");
    expect(result).toEqual(["2026-09"]);
  });
});

describe("formatDailyResendOptionLabel", () => {
  test("오늘·어제·그 밖은 N일 전으로 표시한다", () => {
    expect(formatDailyResendOptionLabel("2026-09-23", "2026-09-23")).toBe(
      "오늘",
    );
    expect(formatDailyResendOptionLabel("2026-09-22", "2026-09-23")).toBe(
      "어제",
    );
    expect(formatDailyResendOptionLabel("2026-09-10", "2026-09-23")).toBe(
      "13일 전",
    );
  });
});

describe("formatWeeklyResendOptionLabel / formatMonthlyResendOptionLabel", () => {
  test("최근순 인덱스를 이번 주/지난 주/전전 주로 표시한다", () => {
    expect(formatWeeklyResendOptionLabel(0)).toBe("이번 주");
    expect(formatWeeklyResendOptionLabel(1)).toBe("지난 주");
    expect(formatWeeklyResendOptionLabel(2)).toBe("전전 주");
  });

  test("최근순 인덱스를 이번 달/지난 달로 표시한다", () => {
    expect(formatMonthlyResendOptionLabel(0)).toBe("이번 달");
    expect(formatMonthlyResendOptionLabel(1)).toBe("지난 달");
  });
});
