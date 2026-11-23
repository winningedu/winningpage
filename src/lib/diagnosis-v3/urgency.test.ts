import { describe, expect, test } from "vitest";
import { scoreUrgency, type UrgencyInput } from "./urgency.js";

const DIAGNOSED = "2026-11-10";

/** Date of Day n, Day 1 = DIAGNOSED (judge-report R11). */
const dayDate = (day: number): string => {
  const date = new Date(Date.UTC(2026, 10, 10 + day - 1));
  return date.toISOString().slice(0, 10);
};

const HIGH = { P1_GOAL: 90, P1_PRIO: 90 };

describe("execution urgency (03 A11-A17, 06 r38-r44)", () => {
  test("계산 예시 A28: 수행평가 Day 19 and 기말고사 Day 32, 탐구 심화 26 gives 20, L2", () => {
    const result = scoreUrgency({
      diagnosedAt: "2026-11-09",
      schedule: [
        { kind: "PERF", date: "2026-11-27" },
        { kind: "EXAM", date: "2026-12-10" },
      ],
      areaScores: { ...HIGH, H12_DEEP: 26, H12_SUBJ: 90 },
    });
    expect(result).toEqual({ base: 10, lowAreas: 1, points: 20, level: "L2" });
  });

  test("PDF p11: 정기고사 on Day 28 gives base 10, no low area, L1", () => {
    const result = scoreUrgency({
      diagnosedAt: DIAGNOSED,
      schedule: [{ kind: "EXAM", date: "2026-12-07" }],
      areaScores: { ...HIGH, P1_PRIO: 41 },
    });
    expect(result).toEqual({ base: 10, lowAreas: 0, points: 10, level: "L1" });
  });

  test("Day boundaries: 1-7 gives 30, 8-14 gives 20, 15-28 gives 10, 29-42 gives 0 (03 B12-B16)", () => {
    const base = (day: number) =>
      scoreUrgency({
        diagnosedAt: DIAGNOSED,
        schedule: [{ kind: "EXAM", date: dayDate(day) }],
        areaScores: HIGH,
      }).base;
    expect([1, 7, 8, 14, 15, 28, 29, 42].map(base)).toEqual([
      30, 30, 20, 20, 10, 10, 0, 0,
    ]);
  });

  test("only the highest base point counts, never a sum (03 A11)", () => {
    const result = scoreUrgency({
      diagnosedAt: DIAGNOSED,
      schedule: [
        { kind: "EXAM", date: dayDate(20) },
        { kind: "PERF", date: dayDate(9) },
        { kind: "MOCK", date: dayDate(3) },
      ],
      areaScores: HIGH,
    });
    expect(result.base).toBe(30);
  });

  test("an application date within 28 days gives 30 whatever the day (03 B15)", () => {
    const apply = (day: number) =>
      scoreUrgency({
        diagnosedAt: DIAGNOSED,
        schedule: [{ kind: "APPLY", date: dayDate(day) }],
        areaScores: HIGH,
      }).base;
    expect([apply(20), apply(28), apply(29)]).toEqual([30, 30, 0]);
  });

  test("unknown gives 5, none gives 0 (03 B16, B17)", () => {
    const base = (schedule: UrgencyInput["schedule"]) =>
      scoreUrgency({
        diagnosedAt: DIAGNOSED,
        schedule,
        areaScores: HIGH,
      }).base;
    expect(base("UNKNOWN")).toBe(5);
    expect(base("NONE")).toBe(0);
    expect(base(undefined)).toBe(0);
  });

  test("+10 per area under 40, MIND excluded, 40 itself is not low (06 r40)", () => {
    const result = scoreUrgency({
      diagnosedAt: DIAGNOSED,
      schedule: "NONE",
      areaScores: {
        P1_GOAL: 39,
        P1_PRIO: 40,
        P1_PLAN: 0,
        H12_REC: 10,
        MIND_EFF: 5,
        MIND_RECV: 0,
      },
    });
    expect(result).toMatchObject({ lowAreas: 3, points: 30, level: "L2" });
  });

  test("levels: 50 L4, 35 L3, 20 L2, below L1 (06 r41-r44)", () => {
    const AREAS_LOW = ["P1_GOAL", "P1_PRIO", "P1_PLAN", "P1_EXEC", "P1_LOG"];
    const level = (schedule: UrgencyInput["schedule"], lowCount: number) =>
      scoreUrgency({
        diagnosedAt: DIAGNOSED,
        schedule,
        areaScores: Object.fromEntries(
          AREAS_LOW.map((code, index) => [code, index < lowCount ? 0 : 90]),
        ),
      });
    expect(level("UNKNOWN", 1)).toMatchObject({ points: 15, level: "L1" });
    expect(level("NONE", 2)).toMatchObject({ points: 20, level: "L2" });
    expect(level("UNKNOWN", 3)).toMatchObject({ points: 35, level: "L3" });
    expect(level("UNKNOWN", 4)).toMatchObject({ points: 45, level: "L3" });
    expect(level("NONE", 5)).toMatchObject({ points: 50, level: "L4" });
  });
});
