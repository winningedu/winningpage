// 가상 날짜 · 주차 경계 골든 픽스처 회귀 테스트
//
// 생성 방법: /Users/hyunsoo/uwellnow/target/api/student.mjs 의
//   144-159 (toYMD/kstYMD), 732-769 (가상 날짜 계열), 797-830 + 845-849 (주차 경계)
//   를 그대로 잘라 스크래치 하네스로 옮긴 뒤 (kstYMD 기본 인자만 고정 NOW 로 교체)
//   아래 입력들을 넣어 실제 실행한 출력이다. 손계산이 아니다.
//
// 타임존 독립성: 하네스를 TZ=UTC / Asia/Seoul / America/New_York / America/Santiago /
//   Pacific/Kiritimati / Pacific/Chatham / Europe/Lisbon 로 각각 실행해 출력이
//   바이트 단위로 동일함을 확인한 케이스만 픽스처로 채택했다.
//   (getRecordDateFromActualStart 는 DST 타임존에서 결과가 달라질 수 있어 —
//    모듈의 NOTE(target-parity) 참고 — 전환 구간을 넘는 입력은 픽스처에서 제외했다.)

import { expect, test } from "vitest";

import {
  addDaysYMD,
  getDayIndexFromYMDServer,
  getFirstSundayYMD,
  getMondayYMD,
  getRecordDateFromActualStart,
  getRegularWeekIndexFromSundayCount,
  getWeeklyReportRange,
  isMiniStartDay,
  kstYMD,
  toYMD,
} from "./virtualDate.ts";

// 결과가 { value } | { nan } | { throws } 중 무엇이든 동일하게 검증하는 헬퍼
function assertOut(fn, expected, label) {
  if (expected.throws) {
    const errorClass = (
      globalThis as unknown as Record<string, new (...args: unknown[]) => Error>
    )[expected.throws];
    expect(fn, label).toThrow(errorClass);
    return;
  }
  const actual = fn();
  if (expected.nan) {
    expect(Number.isNaN(actual), label).toBeTruthy();
    return;
  }
  expect(actual, label).toEqual(expected.value);
}

// ---------- getDayIndexFromYMDServer (월=0 … 일=6) ----------
const DAY_INDEX_CASES = [
  { ymd: "2026-08-10", now: "2026-08-10T15:30:00Z", out: { value: 0 } },
  { ymd: "2026-08-11", now: "2026-08-10T15:30:00Z", out: { value: 1 } },
  { ymd: "2026-08-12", now: "2026-08-10T15:30:00Z", out: { value: 2 } },
  { ymd: "2026-08-13", now: "2026-08-10T15:30:00Z", out: { value: 3 } },
  { ymd: "2026-08-14", now: "2026-08-10T15:30:00Z", out: { value: 4 } },
  { ymd: "2026-08-15", now: "2026-08-10T15:30:00Z", out: { value: 5 } },
  { ymd: "2026-08-16", now: "2026-08-10T15:30:00Z", out: { value: 6 } },
  { ymd: "2024-02-29", now: "2026-08-10T15:30:00Z", out: { value: 3 } },
  { ymd: "2000-01-01", now: "2026-08-10T15:30:00Z", out: { value: 5 } },
  { ymd: "1999-12-31", now: "2026-08-10T15:30:00Z", out: { value: 4 } },
  {
    ymd: "2026-08-10T23:59:59Z",
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  { ymd: "2026-13-45", now: "2026-08-10T15:30:00Z", out: { value: 6 } },
  { ymd: "2026-00-00", now: "2026-08-10T15:30:00Z", out: { value: 6 } },
  { ymd: "garbage!!", now: "2026-08-10T15:30:00Z", out: { nan: true } },
  { ymd: "", now: "2026-08-10T15:30:00Z", out: { value: 1 } },
  { ymd: null, now: "2026-08-10T15:30:00Z", out: { value: 1 } },
  { ymd: undefined, now: "2026-08-10T15:30:00Z", out: { value: 1 } },
  { ymd: 0, now: "2026-08-10T15:30:00Z", out: { value: 1 } },
];

test("getDayIndexFromYMDServer — 골든 픽스처", () => {
  for (const c of DAY_INDEX_CASES) {
    assertOut(
      () => getDayIndexFromYMDServer(c.ymd, new Date(c.now)),
      c.out,
      `ymd=${String(c.ymd)}`,
    );
  }
});

test("getDayIndexFromYMDServer — 월요일 기준 인덱스가 JS getDay 와 어긋나지 않는다", () => {
  // 2026-08-10(월) ~ 2026-08-16(일) 이 0..6 으로 순서대로 나와야 한다
  const week = [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
  ];
  week.forEach((ymd, i) => {
    expect(
      getDayIndexFromYMDServer(ymd, new Date("2026-08-10T15:30:00Z")),
      ymd,
    ).toBe(i);
  });
});

// ---------- addDaysYMD (월말·연말·윤년 경계 포함) ----------
const ADD_DAYS_CASES = [
  {
    ymd: "2026-08-10",
    days: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    ymd: "2026-08-10",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    ymd: "2026-08-10",
    days: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-09" },
  },
  {
    ymd: "2026-08-31",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-09-01" },
  },
  {
    ymd: "2026-01-31",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-02-01" },
  },
  {
    ymd: "2026-12-31",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2027-01-01" },
  },
  {
    ymd: "2026-01-01",
    days: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2025-12-31" },
  },
  {
    ymd: "2024-02-28",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2024-02-29" },
  },
  {
    ymd: "2024-02-29",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2024-03-01" },
  },
  {
    ymd: "2023-02-28",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2023-03-01" },
  },
  {
    ymd: "2024-03-01",
    days: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2024-02-29" },
  },
  {
    ymd: "2026-08-10",
    days: 400,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2027-09-14" },
  },
  {
    ymd: "2026-08-10",
    days: -400,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2025-07-06" },
  },
  {
    ymd: "2026-08-10",
    days: "7",
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-17" },
  },
  {
    ymd: "2026-08-10",
    days: null,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    ymd: "2026-08-10",
    days: undefined,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    ymd: "2026-08-10",
    days: 0.5,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    ymd: "2026-08-10",
    days: "abc",
    now: "2026-08-10T15:30:00Z",
    out: { throws: "RangeError" },
  },
  {
    ymd: "garbage!!",
    days: 1,
    now: "2026-08-10T15:30:00Z",
    out: { throws: "RangeError" },
  },
  {
    ymd: "",
    days: 3,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-14" },
  },
  {
    ymd: null,
    days: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    ymd: undefined,
    days: 5,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-16" },
  },
  {
    ymd: "2026-13-45",
    days: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2027-02-14" },
  },
  {
    ymd: "2026-00-00",
    days: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2025-11-30" },
  },
];

test("addDaysYMD — 골든 픽스처", () => {
  for (const c of ADD_DAYS_CASES) {
    assertOut(
      () => addDaysYMD(c.ymd, c.days, new Date(c.now)),
      c.out,
      `${String(c.ymd)}+${String(c.days)}`,
    );
  }
});

// ---------- getMondayYMD / getFirstSundayYMD / isMiniStartDay ----------
const WEEK_ANCHOR_CASES = [
  {
    ymd: "2026-08-10",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
  {
    ymd: "2026-08-11",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
  {
    ymd: "2026-08-12",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
  {
    ymd: "2026-08-13",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: true },
  },
  {
    ymd: "2026-08-14",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: true },
  },
  {
    ymd: "2026-08-15",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: true },
  },
  {
    ymd: "2026-08-16",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
  {
    ymd: "2026-03-01",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-02-23" },
    firstSunday: { value: "2026-03-01" },
    mini: { value: false },
  },
  {
    ymd: "2024-02-29",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2024-02-26" },
    firstSunday: { value: "2024-03-03" },
    mini: { value: true },
  },
  {
    ymd: "2026-01-01",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2025-12-29" },
    firstSunday: { value: "2026-01-04" },
    mini: { value: true },
  },
  {
    ymd: "2026-12-31",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-12-28" },
    firstSunday: { value: "2027-01-03" },
    mini: { value: true },
  },
  {
    ymd: "",
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
  {
    ymd: null,
    now: "2026-08-10T15:30:00Z",
    monday: { value: "2026-08-10" },
    firstSunday: { value: "2026-08-16" },
    mini: { value: false },
  },
];

test("getMondayYMD / getFirstSundayYMD / isMiniStartDay — 골든 픽스처", () => {
  for (const c of WEEK_ANCHOR_CASES) {
    const now = new Date(c.now);
    assertOut(
      () => getMondayYMD(c.ymd, now),
      c.monday,
      `monday ${String(c.ymd)}`,
    );
    assertOut(
      () => getFirstSundayYMD(c.ymd, now),
      c.firstSunday,
      `firstSunday ${String(c.ymd)}`,
    );
    assertOut(
      () => isMiniStartDay(c.ymd, now),
      c.mini,
      `mini ${String(c.ymd)}`,
    );
  }
});

test("isMiniStartDay — 목·금·토(3·4·5) 만 true", () => {
  const now = new Date("2026-08-10T15:30:00Z");
  const week = [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
  ];
  expect(week.map((d) => isMiniStartDay(d, now))).toEqual([
    false,
    false,
    false,
    true,
    true,
    true,
    false,
  ]);
});

// ---------- getRecordDateFromActualStart ----------
const RECORD_DATE_CASES = [
  {
    actualStartDate: "2026-08-10",
    recordIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: 21,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-31" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-09" },
  },
  {
    actualStartDate: "2026-08-31",
    recordIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-09-01" },
  },
  {
    actualStartDate: "2026-12-31",
    recordIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2027-01-01" },
  },
  {
    actualStartDate: "2024-02-28",
    recordIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2024-02-29" },
  },
  {
    actualStartDate: "2024-02-28",
    recordIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2024-03-01" },
  },
  {
    actualStartDate: "2023-02-28",
    recordIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2023-03-01" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: "5",
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-15" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: null,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: undefined,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    actualStartDate: "2026-08-10T12:00:00Z",
    recordIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-10" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: 365,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2027-08-10" },
  },
  {
    actualStartDate: "",
    recordIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    actualStartDate: null,
    recordIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    actualStartDate: undefined,
    recordIndex: 10,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    actualStartDate: "garbage",
    recordIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: "2026-08-11" },
  },
  {
    actualStartDate: "2026-08-10",
    recordIndex: "abc",
    now: "2026-08-10T15:30:00Z",
    out: { throws: "RangeError" },
  },
];

test("getRecordDateFromActualStart — 골든 픽스처", () => {
  for (const c of RECORD_DATE_CASES) {
    assertOut(
      () =>
        getRecordDateFromActualStart(
          c.actualStartDate,
          c.recordIndex,
          new Date(c.now),
        ),
      c.out,
      `${String(c.actualStartDate)}#${String(c.recordIndex)}`,
    );
  }
});

// ---------- getWeeklyReportRange (미니 온보딩 분기 포함) ----------
const WEEKLY_RANGE_CASES = [
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-11" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-11" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-11",
        endDate: "2026-08-16",
        weekType: "first-week",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-11" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-11" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-12" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-12" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-12",
        endDate: "2026-08-16",
        weekType: "first-week",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-12" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-12" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-13",
        endDate: "2026-08-16",
        weekType: "mini-onboarding",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-31",
        endDate: "2026-09-06",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-14" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-14",
        endDate: "2026-08-16",
        weekType: "mini-onboarding",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-14" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-14" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-14" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-31",
        endDate: "2026-09-06",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-15",
        endDate: "2026-08-16",
        weekType: "mini-onboarding",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-31",
        endDate: "2026-09-06",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-16",
        endDate: "2026-08-16",
        weekType: "first-week",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    weekIndex: 3,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: -1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: -5,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    weekIndex: null,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-13",
        endDate: "2026-08-16",
        weekType: "mini-onboarding",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    weekIndex: undefined,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-08-14" },
    weekIndex: "2",
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2026-12-31" },
    weekIndex: 2,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2027-01-11",
        endDate: "2027-01-17",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "2024-02-29" },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2024-02-29",
        endDate: "2024-03-03",
        weekType: "mini-onboarding",
        isProrated: true,
      },
    },
  },
  {
    student: { actual_start_date: "2024-02-29" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2024-03-04",
        endDate: "2024-03-10",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: null },
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: "" },
    weekIndex: 1,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-11",
        endDate: "2026-08-16",
        weekType: "first-week",
        isProrated: true,
      },
    },
  },
  {
    student: {},
    weekIndex: 0,
    now: "2026-08-10T15:30:00Z",
    out: {
      value: {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: {},
    weekIndex: 0,
    now: "2026-03-01T02:00:00Z",
    out: {
      value: {
        startDate: "2026-02-23",
        endDate: "2026-03-01",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
  {
    student: { actual_start_date: null },
    weekIndex: 2,
    now: "2026-03-01T02:00:00Z",
    out: {
      value: {
        startDate: "2026-03-02",
        endDate: "2026-03-08",
        weekType: "regular",
        isProrated: false,
      },
    },
  },
];

test("getWeeklyReportRange — 골든 픽스처", () => {
  for (const c of WEEKLY_RANGE_CASES) {
    assertOut(
      () => getWeeklyReportRange(c.student, c.weekIndex, new Date(c.now)),
      c.out,
      `${String(c.student.actual_start_date)} wi=${String(c.weekIndex)} now=${c.now}`,
    );
  }
});

// ---------- getRegularWeekIndexFromSundayCount ----------
const REGULAR_WEEK_INDEX_CASES = [
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 1 },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: 2,
    now: "2026-08-10T15:30:00Z",
    out: { value: 2 },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: 5,
    now: "2026-08-10T15:30:00Z",
    out: { value: 5 },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: -1 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: 2,
    now: "2026-08-10T15:30:00Z",
    out: { value: 1 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: 5,
    now: "2026-08-10T15:30:00Z",
    out: { value: 4 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    sundayCount: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    sundayCount: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    sundayCount: 2,
    now: "2026-08-10T15:30:00Z",
    out: { value: 1 },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    sundayCount: 5,
    now: "2026-08-10T15:30:00Z",
    out: { value: 4 },
  },
  {
    student: { actual_start_date: "2026-08-15" },
    sundayCount: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    sundayCount: 0,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    sundayCount: 1,
    now: "2026-08-10T15:30:00Z",
    out: { value: 1 },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    sundayCount: 2,
    now: "2026-08-10T15:30:00Z",
    out: { value: 2 },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    sundayCount: 5,
    now: "2026-08-10T15:30:00Z",
    out: { value: 5 },
  },
  {
    student: { actual_start_date: "2026-08-16" },
    sundayCount: -1,
    now: "2026-08-10T15:30:00Z",
    out: { value: -1 },
  },
  {
    student: { actual_start_date: "2026-08-13" },
    sundayCount: null,
    now: "2026-08-10T15:30:00Z",
    out: { value: 0 },
  },
  {
    student: { actual_start_date: "2026-08-10" },
    sundayCount: undefined,
    now: "2026-08-10T15:30:00Z",
    out: { value: undefined },
  },
  {
    student: {},
    sundayCount: 3,
    now: "2026-08-10T15:30:00Z",
    out: { value: 3 },
  },
];

test("getRegularWeekIndexFromSundayCount — 골든 픽스처", () => {
  for (const c of REGULAR_WEEK_INDEX_CASES) {
    assertOut(
      () =>
        getRegularWeekIndexFromSundayCount(
          c.student,
          c.sundayCount as number,
          new Date(c.now),
        ),
      c.out,
      `${String(c.student.actual_start_date)} sc=${String(c.sundayCount)}`,
    );
  }
});

// ---------- kstYMD (UTC → KST 날짜 경계) ----------
const KST_CASES = [
  { iso: "2026-08-10T14:59:59Z", out: { value: "2026-08-10" } },
  { iso: "2026-08-10T15:00:00Z", out: { value: "2026-08-11" } },
  { iso: "2025-12-31T15:00:00Z", out: { value: "2026-01-01" } },
  { iso: "2024-02-28T15:00:00Z", out: { value: "2024-02-29" } },
];

test("kstYMD — UTC 15:00 에서 KST 날짜가 넘어간다", () => {
  for (const c of KST_CASES) {
    assertOut(() => kstYMD(new Date(c.iso)), c.out, c.iso);
  }
});

test("toYMD — 문자열은 앞 10자, falsy 는 빈 문자열", () => {
  expect(toYMD("2026-08-10T12:34:56Z")).toBe("2026-08-10");
  expect(toYMD("2026-08-10")).toBe("2026-08-10");
  expect(toYMD("")).toBe("");
  expect(toYMD(null)).toBe("");
  expect(toYMD(undefined)).toBe("");
  expect(toYMD(0)).toBe("");
});

test("getRecordDateFromActualStart: 실행 환경의 DST 시간대와 무관하게 달력 날짜를 더한다", () => {
  const original = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    expect(
      getRecordDateFromActualStart(
        "2026-01-15",
        100,
        new Date("2026-01-15T00:00:00Z"),
      ),
    ).toBe("2026-04-25");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
