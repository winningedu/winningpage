import { describe, expect, test } from "vitest";
import {
  dailyReportDispatchYmd,
  dispatchAtKst,
  MAX_RESEND_DAYS_AGO,
  monthlyReportDispatchYmd,
  weeklyReportDispatchYmd,
} from "./goalReportResendPolicy.js";

describe("dailyReportDispatchYmd", () => {
  test("일간 리포트는 그날 저녁(22:00 KST)에 나가므로 기준일 = periodKey 자신", () => {
    expect(dailyReportDispatchYmd("2026-09-10")).toBe("2026-09-10");
  });
});

describe("weeklyReportDispatchYmd", () => {
  test("주간 리포트는 그 주 다음 월요일(08:00 KST)에 나간다", () => {
    expect(weeklyReportDispatchYmd("2026-09-07")).toBe("2026-09-14");
  });
});

describe("monthlyReportDispatchYmd", () => {
  test("월간 리포트는 그 달 마지막 날(23:00 KST)에 나간다", () => {
    expect(monthlyReportDispatchYmd("2026-09")).toBe("2026-09-30");
  });

  test("2월(평년)도 마지막 날을 정확히 계산한다", () => {
    expect(monthlyReportDispatchYmd("2026-02")).toBe("2026-02-28");
  });

  test("12월은 연도가 넘어가는 경계를 정확히 처리한다", () => {
    expect(monthlyReportDispatchYmd("2026-12")).toBe("2026-12-31");
  });
});

test("MAX_RESEND_DAYS_AGO는 14다", () => {
  expect(MAX_RESEND_DAYS_AGO).toBe(14);
});

// QA 행 — *DispatchYmd 함수들은 "날짜"까지만 알려줘 당일 발송 시각(22:00/08:00/23:00
// KST) 전에도 재발송을 허용하는 사고가 있었다. dispatchAtKst는 시·분까지 포함한
// 정확한 발송 시각을 UTC Date로 돌려준다(KST = UTC+9이므로 UTC 시는 9를 뺀 값).
describe("dispatchAtKst", () => {
  test("daily — 그날 22:00 KST = 그날 13:00 UTC", () => {
    expect(dispatchAtKst("daily", "2026-09-10").toISOString()).toBe(
      "2026-09-10T13:00:00.000Z",
    );
  });

  test("weekly — 다음 월요일 08:00 KST는 전날(일요일) 23:00 UTC", () => {
    // weekStart=09-07 → 발송 월요일 09-14, 08:00 KST = 09-13 23:00 UTC.
    expect(dispatchAtKst("weekly", "2026-09-07").toISOString()).toBe(
      "2026-09-13T23:00:00.000Z",
    );
  });

  test("monthly — 그 달 마지막 날 23:00 KST = 같은 날 14:00 UTC", () => {
    expect(dispatchAtKst("monthly", "2026-09").toISOString()).toBe(
      "2026-09-30T14:00:00.000Z",
    );
  });
});
