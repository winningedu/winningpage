import { describe, expect, test } from "vitest";
import { AREAS, MIND_CODES, P1_CODES, P2_CODES, TRACK_NAMES } from "./codes.js";
import { SCORE_SHEETS } from "./source/scoreSheets.js";

const areaRows = (SCORE_SHEETS["05_영역설정"] ?? []).filter((row) =>
  /^(P1|H12|H3|M3|MIND)_/.test(String(row.c[2])),
);

describe("area codes (05_영역설정)", () => {
  test("typed code lists follow the sheet rows in display order", () => {
    expect([
      ...P1_CODES,
      ...P2_CODES.H12,
      ...P2_CODES.H3,
      ...P2_CODES.M3,
      ...MIND_CODES,
    ]).toEqual(areaRows.map((row) => row.c[2]));
  });

  test("labels and weights come from the sheet", () => {
    expect(AREAS.P1_EXEC).toMatchObject({ label: "학습 수행", weight: 20 });
    expect(AREAS.H12_DEEP).toMatchObject({ label: "탐구 심화", weight: 20 });
    expect(AREAS.MIND_RECV).toMatchObject({ weight: 0, aux: "Q10" });
    expect(AREAS.MIND_EFF.aux).toBe("없음");
  });

  test("PAGE1 and each track weigh 100 in total", () => {
    const sum = (codes: readonly (keyof typeof AREAS)[]) =>
      codes.reduce((total, code) => total + AREAS[code].weight, 0);
    expect(sum(P1_CODES)).toBe(100);
    expect(sum(P2_CODES.H12)).toBe(100);
    expect(sum(P2_CODES.H3)).toBe(100);
    expect(sum(P2_CODES.M3)).toBe(100);
  });

  test("track codes name the sheet tracks", () => {
    expect(TRACK_NAMES).toEqual({
      M3: "중3",
      H12: "고1\u00b72",
      H3: "고3\u00b7N수",
    });
  });
});
