// W7 엑셀 출력 표. 집계값만 담고(교 #40) 이름 칸의 수식 문자는 글자로 막는다.

import { describe, expect, it } from "vitest";
import { buildEnrollmentGrid, enrollmentFileName } from "./exportGrid";
import type { ClassRow } from "./format";

const row = (over: Partial<ClassRow> = {}): ClassRow => ({
  classId: "c1",
  grade: "고1",
  groupName: "A레벨",
  className: "1",
  homeroomName: "김담임",
  total: 30,
  capacity: 32,
  joined: 28,
  services: {
    diagnosis: 28,
    goal: 15,
    growth: 0,
    performance: 0,
    selfeval: 0,
    inquiry: 3,
  },
  goalRateAvg: 57,
  ...over,
});

describe("buildEnrollmentGrid", () => {
  it("제목, 조회 조건, 서비스별 이용, 반별 표, 합계 행 순으로 집계값을 담는다", () => {
    const grid = buildEnrollmentGrid({
      rows: [
        row(),
        row({
          classId: "c2",
          className: "2",
          total: 10,
          capacity: null,
          joined: 5,
          homeroomName: null,
          goalRateAvg: null,
          services: {
            diagnosis: 5,
            goal: 0,
            growth: 0,
            performance: 0,
            selfeval: 0,
            inquiry: 0,
          },
        }),
      ],
      filter: { grade: "학년그룹: 1학년", class: "반: 전체" },
      asOf: "2026-11-05",
      scopeLabel: "1학년",
    });

    expect(grid[0]).toEqual(["이용현황"]);
    expect(grid[1]).toEqual(["조회 조건", "학년그룹: 1학년", "반: 전체"]);
    expect(grid[2]).toEqual(["집계 기준", "1학년, 2026.11.05 기준"]);
    const header = grid.findIndex((r) => r[0] === "담임");
    expect(grid[header]).toEqual([
      "담임",
      "학년그룹",
      "반",
      "총원",
      "정원",
      "이용 학생",
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "자기평가",
      "심화탐구",
      "목표 실행률 평균",
    ]);
    expect(grid[header + 1]).toEqual([
      "김담임",
      "1학년-A레벨",
      "1반",
      30,
      32,
      28,
      "28명 (93%)",
      "15명 (50%)",
      "0명 (0%)",
      "0명 (0%)",
      "0명 (0%)",
      "3명 (10%)",
      "57%",
    ]);
    expect(grid[header + 2]).toEqual([
      "담임 미배정",
      "1학년-A레벨",
      "2반",
      10,
      "",
      5,
      "5명 (50%)",
      "0명 (0%)",
      "0명 (0%)",
      "0명 (0%)",
      "0명 (0%)",
      "0명 (0%)",
      "",
    ]);
    expect(grid[header + 3]).toEqual([
      "합계",
      "",
      "",
      40,
      32,
      33,
      "33명 (83%)",
      "15명 (38%)",
      "0명 (0%)",
      "0명 (0%)",
      "0명 (0%)",
      "3명 (8%)",
      "",
    ]);
  });

  it("수식으로 읽힐 담임 이름 앞에 작은따옴표를 붙인다", () => {
    const grid = buildEnrollmentGrid({
      rows: [row({ homeroomName: '=HYPERLINK("x")' })],
      filter: { grade: "", class: "" },
      asOf: "2026-11-05",
      scopeLabel: "학교 전체",
    });

    const header = grid.findIndex((r) => r[0] === "담임");
    expect(grid[header + 1]?.[0]).toBe('\'=HYPERLINK("x")');
  });
});

describe("enrollmentFileName", () => {
  it("스쿨멘토_이용현황_날짜 에 확장자를 붙인다", () => {
    expect(enrollmentFileName("2026-11-05")).toBe(
      "스쿨멘토_이용현황_20261105.xlsx",
    );
  });
});
