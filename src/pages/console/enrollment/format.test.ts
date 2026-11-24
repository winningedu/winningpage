// QA 52 미가입 계산. 정원이 있으면 max(정원 - 총원, 명단 대기 수), 없으면 명단 대기 수다.

import { describe, expect, it } from "vitest";
import { type ClassRow, totalsOf, unenrolledOf } from "./format";

const row = (over: Partial<ClassRow> = {}): ClassRow => ({
  classId: "c1",
  grade: "고1",
  groupName: null,
  className: "1",
  homeroomName: null,
  total: 0,
  pendingCount: 0,
  capacity: null,
  joined: 0,
  services: {
    diagnosis: 0,
    goal: 0,
    growth: 0,
    performance: 0,
    selfeval: 0,
    inquiry: 0,
  },
  goalRateAvg: null,
  ...over,
});

describe("unenrolledOf", () => {
  it.each([
    [8, 12, 0, 4],
    [4, 4, 0, 0],
    [3, 6, 0, 3],
    [8, 9, 0, 1],
    [3, 3, 0, 0],
    [30, 32, 3, 3],
    [10, 12, 5, 5],
  ])(
    "총원 %i, 정원 %i, 명단 %i 이면 %i",
    (total, capacity, pendingCount, want) => {
      expect(unenrolledOf(row({ total, capacity, pendingCount }))).toBe(want);
    },
  );

  it("정원이 없으면 명단 대기 수 그대로다", () => {
    expect(
      unenrolledOf(row({ total: 5, capacity: null, pendingCount: 0 })),
    ).toBe(0);
    expect(
      unenrolledOf(row({ total: 5, capacity: null, pendingCount: 2 })),
    ).toBe(2);
  });
});

describe("totalsOf", () => {
  it("미가입 합계는 반별 미가입 값의 합이다", () => {
    const totals = totalsOf([
      row({ total: 8, capacity: 12 }),
      row({ total: 3, capacity: 6 }),
      row({ total: 5, capacity: null, pendingCount: 2 }),
    ]);

    expect(totals.pending).toBe(4 + 3 + 2);
  });
});
