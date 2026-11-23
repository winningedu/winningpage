import { describe, expect, test } from "vitest";
import { numberCell } from "./sheet.js";

describe("numberCell", () => {
  test('an empty string cell is not a number (Number("") would read 0)', () => {
    expect(() => numberCell({ r: 1, c: [""] }, 0)).toThrow(
      "not a number r1 c0",
    );
  });

  test("a numeric cell reads as its number", () => {
    expect(numberCell({ r: 14, c: ["수준", "높음", 70] }, 2)).toBe(70);
  });
});
