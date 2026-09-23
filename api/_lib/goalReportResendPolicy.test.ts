import { describe, expect, test } from "vitest";
import {
  dailyReportDispatchYmd,
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
