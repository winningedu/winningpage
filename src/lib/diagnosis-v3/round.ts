// Half-up rounding on exact integer fractions (judge-report 3-1). Callers pass
// the integer numerator and denominator of the value instead of a float, so
// 66.35 is 6635 / 100 and never the binary float 66.34999...

const assertIntegers = (numerator: number, denominator: number) => {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error(
      `roundHalfUp needs integers, got ${numerator}/${denominator}`,
    );
  }
};

/** numerator / denominator rounded to an integer, .5 up. Non-negative inputs. */
export function roundHalfUpInt(numerator: number, denominator: number): number {
  assertIntegers(numerator, denominator);
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** numerator / denominator rounded to one decimal, .05 up. Non-negative inputs. */
export function roundHalfUp1(numerator: number, denominator: number): number {
  return roundHalfUpInt(10 * numerator, denominator) / 10;
}
