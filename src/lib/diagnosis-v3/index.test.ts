import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3, validateAnswers } from "./index.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";
import { SCHEMA_VERSION } from "./types.js";

const calc = () => scoreDiagnosisV3(CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT);

test("validation is exported from the entry", () => {
  expect(validateAnswers(CALC_EXAMPLE, "2026-11-09").ok).toBe(true);
});

describe("계산 예시 scores", () => {
  test("composites, grade level and student type (계산 예시 D10, D12, D24)", () => {
    const { version, scores } = calc();
    expect(version).toBe(SCHEMA_VERSION);
    expect(scores.page1.total).toBe(67);
    expect(scores.page1.level).toBe("L3");
    expect(scores.page2.total).toBe(56.9);
    expect(scores.studentType).toBe(9);
  });

  test("plan, services, urgency, admission and temperament (계산 예시 D27-D33)", () => {
    const { scores } = calc();
    expect(scores.plan.tasks).toHaveLength(20);
    expect(scores.plan.redxDate).toBe("2026-12-07");
    expect(scores.services.ranked.map((s) => s.code)).toEqual(["DEEP", "GOAL"]);
    expect(scores.urgency.level).toBe("L2");
    expect(scores.urgency.points).toBe(20);
    expect(scores.admission).toMatchObject({ status: "COMPUTED", band: 4 });
    expect(scores.temperament.representative).toEqual({
      kind: "single",
      dim: "NS",
    });
  });

  test("goal cell and ladder (22 r29, r35)", () => {
    expect(calc().scores.goal).toEqual({
      cell: "C_NA",
      ladder: { far: true, mid: true, near: true },
    });
  });

  test("goal cell follows the q3r motive counts (22 r29)", () => {
    const goal = (q3: number, q3r: number[]) =>
      scoreDiagnosisV3({ ...CALC_EXAMPLE, q3, q3r }, CALC_EXAMPLE_CONTEXT)
        .scores.goal.cell;
    expect(goal(5, [1, 3])).toBe("E_MIX");
    expect(goal(2, [1])).toBe("C_IN");
    expect(goal(4, [3, 4])).toBe("E_EX");
    expect(goal(1, [7])).toBe("C_NA");
  });
});
