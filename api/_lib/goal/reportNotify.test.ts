import { describe, expect, test } from "vitest";
import { dueReportPeriod } from "./reportNotify.js";

const SEOUL = "Asia/Seoul";
const LA = "America/Los_Angeles";

describe("dueReportPeriod — daily(현지 22시)", () => {
  test("서울 학생은 13:00Z 실행에서만 그날 날짜가 나온다", () => {
    expect(
      dueReportPeriod("daily", new Date("2026-11-23T13:00:00Z"), SEOUL),
    ).toBe("2026-11-23");
    // 같은 시각(분만 다름)도 같은 시간대다.
    expect(
      dueReportPeriod("daily", new Date("2026-11-23T13:59:59Z"), SEOUL),
    ).toBe("2026-11-23");
    expect(
      dueReportPeriod("daily", new Date("2026-11-23T12:00:00Z"), SEOUL),
    ).toBeNull();
    expect(
      dueReportPeriod("daily", new Date("2026-11-23T14:00:00Z"), SEOUL),
    ).toBeNull();
  });

  test("로스앤젤레스 학생은 겨울(PST) 06:00Z, 여름(PDT) 05:00Z 실행에서 나온다", () => {
    expect(dueReportPeriod("daily", new Date("2026-11-24T06:00:00Z"), LA)).toBe(
      "2026-11-23",
    );
    expect(
      dueReportPeriod("daily", new Date("2026-11-24T05:00:00Z"), LA),
    ).toBeNull();
    expect(dueReportPeriod("daily", new Date("2026-07-24T05:00:00Z"), LA)).toBe(
      "2026-07-23",
    );
    expect(
      dueReportPeriod("daily", new Date("2026-07-24T06:00:00Z"), LA),
    ).toBeNull();
  });

  test("서울의 13:00Z 실행은 로스앤젤레스 학생에게 해당하지 않는다", () => {
    expect(
      dueReportPeriod("daily", new Date("2026-11-23T13:00:00Z"), LA),
    ).toBeNull();
  });
});

describe("dueReportPeriod — weekly(현지 월요일 08시, 기간은 지난 주 월요일)", () => {
  test("서울 월요일 08:00 = 일요일 23:00Z, 지난 주 월요일을 돌려준다", () => {
    expect(
      dueReportPeriod("weekly", new Date("2026-11-22T23:00:00Z"), SEOUL),
    ).toBe("2026-11-16");
    expect(
      dueReportPeriod("weekly", new Date("2026-11-23T23:00:00Z"), SEOUL),
    ).toBeNull();
  });

  test("로스앤젤레스는 월요일 16:00Z(PST)에 같은 규칙으로 계산된다", () => {
    expect(
      dueReportPeriod("weekly", new Date("2026-11-23T16:00:00Z"), LA),
    ).toBe("2026-11-16");
    // 서울 기준 실행 시각은 LA 에서는 일요일 15시라 해당 없음.
    expect(
      dueReportPeriod("weekly", new Date("2026-11-22T23:00:00Z"), LA),
    ).toBeNull();
  });
});

describe("dueReportPeriod — monthly(현지 1일 08시, 기간은 지난 달)", () => {
  test("서울 12월 1일 08:00 = 11월 30일 23:00Z, 지난 달 키가 나온다", () => {
    expect(
      dueReportPeriod("monthly", new Date("2026-11-30T23:00:00Z"), SEOUL),
    ).toBe("2026-11");
    expect(
      dueReportPeriod("monthly", new Date("2026-11-29T23:00:00Z"), SEOUL),
    ).toBeNull();
  });

  test("로스앤젤레스 12월 1일 08:00 PST = 16:00Z", () => {
    expect(
      dueReportPeriod("monthly", new Date("2026-12-01T16:00:00Z"), LA),
    ).toBe("2026-11");
  });

  test("1월 1일은 전년 12월을 가리킨다", () => {
    expect(
      dueReportPeriod("monthly", new Date("2026-12-31T23:00:00Z"), SEOUL),
    ).toBe("2026-12");
  });
});
