// Area tie rule, 23_동점규칙 r6-r10.

import type { AreaCode } from "./codes.js";
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
    // 23 r6 step 1: lower score first
    return x.score - y.score || codes.indexOf(a) - codes.indexOf(b);
  });
}
