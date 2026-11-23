import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3, validateAnswers } from "./index.js";
import { COPY_SHEETS } from "./source/copyText.js";
import {
  CALC_EXAMPLE,
  CALC_EXAMPLE_CONTEXT,
  validAnswers,
} from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";
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

// 12_금지어 B: banned phrases, " / " separated (rows 5-13).
const BANNED = (COPY_SHEETS["12_금지어"] ?? [])
  .filter((row) => row.r >= 5 && typeof row.c[1] === "string")
  .flatMap((row) => String(row.c[1]).split(" / "));

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

const VARIANTS: Readonly<Record<string, DiagnosisV3Answers>> = {
  M3: validAnswers("M3"),
  H12: validAnswers("H12"),
  H3: validAnswers("H3"),
  // F5: 8번 all 보통 with no 10번 pick (17 r11)
  SIMPLE: {
    ...validAnswers("H12"),
    q9: { items: Array(15).fill(2), verify: 1 },
    q10: [],
  },
  // F6: 21번 all 보통 (17 r12)
  CAUTION: {
    ...validAnswers("H12"),
    q23: { items: Array(35).fill(2), verify: 3 },
  },
};

describe("payload text (12_금지어, placeholders)", () => {
  test("the banned list is read from the sheet", () => {
    expect(BANNED).toContain("반드시 합격");
    expect(BANNED.length).toBeGreaterThan(20);
  });

  for (const [name, answers] of Object.entries(VARIANTS)) {
    test(name + ": no banned phrase and no unfilled {placeholder}", () => {
      const texts = strings(scoreDiagnosisV3(answers, CALC_EXAMPLE_CONTEXT));
      expect(texts.filter((t) => BANNED.some((b) => t.includes(b)))).toEqual(
        [],
      );
      expect(texts.filter((t) => /\{[^{}]*\}/.test(t))).toEqual([]);
    });
  }
});

describe("payload shape", () => {
  test("same input twice gives a deep-equal payload", () => {
    expect(calc()).toEqual(calc());
  });

  test("JSON size stays under 200 KB", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(calc())).length;
    expect(bytes).toBeLessThan(200 * 1024);
  });
});
