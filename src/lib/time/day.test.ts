import { describe, expect, it } from "vitest";
import { calendarSchoolYear } from "../../../api/_lib/console/schoolYear.js";
import {
  addDaysYmd,
  addMonthsIn,
  dayRangeUtc,
  dayStartUtc,
  schoolYearOf,
  ymdIn,
} from "./day.js";

describe("ymdIn", () => {
  it("서울 자정 직후 순간은 다음 날이다", () => {
    expect(ymdIn("2026-11-22T15:00:00Z", "Asia/Seoul")).toBe("2026-11-23");
  });

  it("서울 자정 직전 순간은 전날이다", () => {
    expect(ymdIn("2026-11-22T14:59:59.999Z", "Asia/Seoul")).toBe("2026-11-22");
  });

  it("같은 순간도 로스앤젤레스에서는 전날이다", () => {
    expect(ymdIn("2026-11-22T15:00:00Z", "America/Los_Angeles")).toBe(
      "2026-11-22",
    );
  });

  it("Date 와 ISO 문자열을 모두 받는다", () => {
    const iso = "2026-11-22T15:00:00Z";
    expect(ymdIn(new Date(iso), "Asia/Seoul")).toBe(ymdIn(iso, "Asia/Seoul"));
  });
});

describe("addDaysYmd", () => {
  it("월 경계를 넘는다", () => {
    expect(addDaysYmd("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("연 경계를 넘는다", () => {
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("윤일을 지난다", () => {
    expect(addDaysYmd("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysYmd("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("음수 일수는 과거로 간다", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysYmd("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("dayStartUtc", () => {
  it("서울 하루의 시작은 전날 15시(UTC)다", () => {
    expect(dayStartUtc("2026-11-23", "Asia/Seoul")).toBe(
      "2026-11-22T15:00:00.000Z",
    );
  });

  it("UTC 는 그 날 0시다", () => {
    expect(dayStartUtc("2026-11-23", "UTC")).toBe("2026-11-23T00:00:00.000Z");
  });

  it("뉴욕 서머타임 시작 전날과 당일의 오프셋이 다르다", () => {
    expect(dayStartUtc("2026-03-08", "America/New_York")).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(dayStartUtc("2026-03-09", "America/New_York")).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  it("자정이 서머타임 공백에 있으면 실제로 존재하는 첫 순간을 돌려준다", () => {
    // 산티아고는 2026-09-06 00:00 이 사라지고 01:00 이 하루의 첫 순간이다.
    expect(dayStartUtc("2026-09-06", "America/Santiago")).toBe(
      "2026-09-06T04:00:00.000Z",
    );
    expect(ymdIn("2026-09-06T03:59:59.999Z", "America/Santiago")).toBe(
      "2026-09-05",
    );
  });
});

describe("dayRangeUtc", () => {
  it("서울 11월 한 달은 10/31 15시부터 11/30 15시(배타)까지다", () => {
    expect(dayRangeUtc("2026-11-01", "2026-11-30", "Asia/Seoul")).toEqual({
      from: "2026-10-31T15:00:00.000Z",
      toExclusive: "2026-11-30T15:00:00.000Z",
    });
  });
});

describe("addMonthsIn", () => {
  // DB fn_add_months_kst: 현지 하루 시작으로 자르고 달력 개월을 더한다(말일 보정).
  it("서울 1/31 에 1개월을 더하면 2/28 하루 시작이다", () => {
    expect(addMonthsIn("2026-01-31T03:00:00Z", 1, "Asia/Seoul")).toBe(
      "2026-02-27T15:00:00.000Z",
    );
  });

  it("서울 윤일 2/29 에 12개월을 더하면 다음 해 2/28 이다", () => {
    expect(addMonthsIn("2028-02-29T03:00:00Z", 12, "Asia/Seoul")).toBe(
      "2029-02-27T15:00:00.000Z",
    );
  });

  it("현지 날짜 기준으로 자른다(UTC 로는 전날 15시여도 서울 다음 날)", () => {
    expect(addMonthsIn("2026-03-14T16:00:00Z", 0, "Asia/Seoul")).toBe(
      "2026-03-14T15:00:00.000Z",
    );
  });

  it("다른 시간대에서도 그 시간대의 하루 시작이다", () => {
    expect(addMonthsIn("2026-01-31T12:00:00Z", 1, "America/New_York")).toBe(
      "2026-02-28T05:00:00.000Z",
    );
    expect(addMonthsIn("2026-01-31T12:00:00Z", 2, "America/New_York")).toBe(
      "2026-03-31T04:00:00.000Z",
    );
  });
});

describe("schoolYearOf", () => {
  it("서울 3/1 0시부터 그 해 학년도다", () => {
    expect(schoolYearOf("2026-02-28T15:00:00Z", "Asia/Seoul")).toBe(2026);
  });

  it("서울 2/28 마지막 순간은 전년도 학년도다", () => {
    expect(schoolYearOf("2026-02-28T14:59:59Z", "Asia/Seoul")).toBe(2025);
  });

  it("같은 순간도 뉴욕에서는 아직 2월이라 전년도다", () => {
    expect(schoolYearOf("2026-02-28T15:00:00Z", "America/New_York")).toBe(2025);
  });

  it("서울 기준 calendarSchoolYear 와 같은 값을 낸다", () => {
    for (const iso of [
      "2025-12-31T23:00:00Z",
      "2026-02-28T14:59:59Z",
      "2026-02-28T15:00:00Z",
      "2026-08-15T00:00:00Z",
      "2027-02-28T15:00:00Z",
    ]) {
      expect(schoolYearOf(iso, "Asia/Seoul")).toBe(
        calendarSchoolYear(new Date(iso)),
      );
    }
  });
});
