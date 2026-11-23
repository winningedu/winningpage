// 4-week plan (21_4주플랜, 15_4주과제 copy). Area orders come in already
// sorted low to high by the 23 tie rule, so the plan never re-ranks areas.

import type { P1Code, P2Code } from "./codes.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  IsoDate,
  Ordinal,
} from "./types.js";

export type ExamOps = DiagnosisV3Scores["examOps"];
export type Plan = DiagnosisV3Scores["plan"];

export type PlanInput = {
  readonly diagnosedAt: IsoDate;
  /** PAGE1 stages, low to high (23 rule) */
  readonly page1Order: readonly P1Code[];
  /** PAGE2 areas, low to high (23 rule) */
  readonly page2Order: readonly P2Code[];
  readonly schedule: DiagnosisV3Answers["q13"];
  readonly examOps: ExamOps;
  /** q21 weekday ordinal */
  readonly weekdayLoad: Ordinal;
};

const first = <T>(list: readonly T[], index: number, what: string): T => {
  const value = list[index];
  if (value === undefined) throw new Error(`missing ${what} ${index + 1}`);
  return value;
};

export function buildPlan(input: PlanInput): Pick<Plan, "columns"> {
  // 21 C9: columns 1-2 = two lowest PAGE1 stages; 21 C10: column 3 = lowest PAGE2 area
  const columns: Plan["columns"] = [
    first(input.page1Order, 0, "PAGE1 stage"),
    first(input.page1Order, 1, "PAGE1 stage"),
    first(input.page2Order, 0, "PAGE2 area"),
  ];
  return { columns };
}
