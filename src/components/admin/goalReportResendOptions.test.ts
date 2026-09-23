// api/goal/admin/resend-report.test.ts 와 같은 기준일 규칙(기간 시작이 아니라
// 그 기간의 자동 발송일)로 후보를 고른다 — TODAY=2026-09-23(수)를 기본으로 쓴다.

import { describe, expect, test } from "vitest";
import {
  listDailyResendCandidates,
  listMonthlyResendCandidates,
  listResendCandidates,
  listWeeklyResendCandidates,
} from "./goalReportResendOptions";

const TODAY = "2026-09-23";

describe("listDailyResendCandidates", () => {
  test("오늘부터 13일 전까지 최근순 14개, 라벨은 오늘/어제/N일 전", () => {
    const result = listDailyResendCandidates(TODAY);
    expect(result).toHaveLength(14);
    expect(result[0]).toEqual({ periodKey: "2026-09-23", label: "오늘" });
    expect(result[1]).toEqual({ periodKey: "2026-09-22", label: "어제" });
    expect(result[2]).toEqual({ periodKey: "2026-09-21", label: "2일 전" });
    expect(result[13]).toEqual({ periodKey: "2026-09-10", label: "13일 전" });
  });
});

describe("listWeeklyResendCandidates", () => {
  test("이번 주는 발송일(다음 월요일)이 미래라 후보에 없다 — 지난 주부터 시작", () => {
    // 2026-09-23(수)의 이번 주 월요일은 09-21이지만, 그 주 발송일(09-28)은
    // 아직 미래라 후보에 없다.
    const result = listWeeklyResendCandidates(TODAY);
    expect(result).toEqual([
      { periodKey: "2026-09-14", label: "지난 주" },
      { periodKey: "2026-09-07", label: "전전 주" },
    ]);
  });

  test("오늘이 월요일이면 발송일이 이미 지난 주가 3개까지 늘어난다", () => {
    // 2026-09-21(월) 기준 3주 전(08-31) 발송일(09-07)까지의 diff가 정확히 14.
    const result = listWeeklyResendCandidates("2026-09-21");
    expect(result).toEqual([
      { periodKey: "2026-09-14", label: "지난 주" },
      { periodKey: "2026-09-07", label: "전전 주" },
      { periodKey: "2026-08-31", label: "3주 전" },
    ]);
  });
});

describe("listMonthlyResendCandidates", () => {
  test("달 초(1~14일경)면 지난 달만 후보로 남는다 — 이번 달은 아직 발송 전", () => {
    const result = listMonthlyResendCandidates("2026-09-10");
    expect(result).toEqual([{ periodKey: "2026-08", label: "지난 달" }]);
  });

  test("달 후반이면 지난 달 발송일도 14일을 넘겨 후보가 비어 있다", () => {
    const result = listMonthlyResendCandidates(TODAY);
    expect(result).toEqual([]);
  });

  test("그 달의 마지막 날이면 '이번 달'이 후보로 뜬다(발송 당일)", () => {
    const result = listMonthlyResendCandidates("2026-09-30");
    expect(result).toEqual([{ periodKey: "2026-09", label: "이번 달" }]);
  });
});

describe("listResendCandidates — kind 분기", () => {
  test("kind별로 대응하는 후보 목록 함수를 그대로 위임한다", () => {
    expect(listResendCandidates("daily", TODAY)).toEqual(
      listDailyResendCandidates(TODAY),
    );
    expect(listResendCandidates("weekly", TODAY)).toEqual(
      listWeeklyResendCandidates(TODAY),
    );
    expect(listResendCandidates("monthly", TODAY)).toEqual(
      listMonthlyResendCandidates(TODAY),
    );
  });
});
