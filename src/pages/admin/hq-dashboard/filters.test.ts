import { describe, expect, test } from "vitest";
import { logSearch, readLoginFilters, statsSearch } from "./filters";

const TODAY = "2026-11-23";
const read = (search: string) =>
  readLoginFilters(new URLSearchParams(search), TODAY);

describe("readLoginFilters", () => {
  test("주소에 값이 없으면 이번 달 1일부터 오늘, 일 단위, 달력 기준, 내부 계정 제외, 1쪽", () => {
    expect(read("")).toEqual({
      from: "2026-11-01",
      to: "2026-11-23",
      grain: "day",
      mau: "calendar",
      includeInternal: false,
      page: 1,
    });
  });

  test("주소의 값을 그대로 읽는다", () => {
    expect(
      read(
        "loginFrom=2026-10-01&loginTo=2026-10-31&loginGrain=week&loginMau=rolling30&includeInternal=1&loginPage=3",
      ),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      grain: "week",
      mau: "rolling30",
      includeInternal: true,
      page: 3,
    });
  });

  test("모르는 값은 기본값으로 읽는다", () => {
    expect(
      read(
        "loginFrom=2026/10/01&loginTo=x&loginGrain=year&loginMau=weekly&includeInternal=yes&loginPage=0",
      ),
    ).toEqual(read(""));
  });
});

describe("검색 문자열", () => {
  test("통계 조회는 view=stats 와 묶음, MAU 기준을 싣고 포함 여부를 includeInternal 1 또는 0 으로 싣는다", () => {
    expect(statsSearch(read(""))).toBe(
      "view=stats&from=2026-11-01&to=2026-11-23&grain=day&mau=calendar&includeInternal=0",
    );
    expect(statsSearch(read("includeInternal=1&loginGrain=month"))).toBe(
      "view=stats&from=2026-11-01&to=2026-11-23&grain=month&mau=calendar&includeInternal=1",
    );
  });

  test("기록 표 조회는 view=log 와 쪽 번호를 싣는다", () => {
    expect(logSearch(read("loginPage=2&includeInternal=1"))).toBe(
      "view=log&from=2026-11-01&to=2026-11-23&page=2&includeInternal=1",
    );
  });
});
