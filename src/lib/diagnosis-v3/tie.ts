// Area tie rule, 23_동점규칙 r6-r10.

import { AREAS, type AreaCode } from "./codes.js";
import type { AreaScore } from "./types.js";

type Areas<C extends AreaCode> = Readonly<Partial<Record<C, AreaScore>>>;

const scoreOf = <C extends AreaCode>(areas: Areas<C>, code: C): AreaScore => {
  const area = areas[code];
  if (!area) throw new Error(`missing area ${code}`);
  return area;
};

/**
 * Low to high (보완 우선). codes is the 05 display order, the last step.
 */
export function orderLowToHigh<C extends AreaCode>(
  areas: Areas<C>,
  codes: readonly C[],
): C[] {
  return [...codes].sort((a, b) => {
    const x = scoreOf(areas, a);
    const y = scoreOf(areas, b);
    return (
      // 23 r6 step 1: lower score first
      x.score - y.score ||
      // 23 r7 step 2: more picked difficulty checks first
      y.checks - x.checks ||
      // 23 r8 step 3: lower lowest single answer first
      x.minItem - y.minItem ||
      // 23 r9 step 4: larger 05 weight first
      AREAS[b].weight - AREAS[a].weight ||
      // 23 r10 step 5: 05 display order
      codes.indexOf(a) - codes.indexOf(b)
    );
  });
}

/**
 * High to low (강점 순위, 23 r6). judge-report R2 (a): steps 2 and 3 flip
 * (fewer checks, higher lowest answer first); step 4 (larger weight) and step 5
 * (display order) stay.
 */
export function orderHighToLow<C extends AreaCode>(
  areas: Areas<C>,
  codes: readonly C[],
): C[] {
  return [...codes].sort((a, b) => {
    const x = scoreOf(areas, a);
    const y = scoreOf(areas, b);
    return (
      y.score - x.score ||
      x.checks - y.checks ||
      y.minItem - x.minItem ||
      AREAS[b].weight - AREAS[a].weight ||
      codes.indexOf(a) - codes.indexOf(b)
    );
  });
}
