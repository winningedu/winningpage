import { describe, expect, test } from "vitest";
import {
  AREAS,
  MIND_CODES,
  P1_CODES,
  P2_CODES,
  SERVICE_CODES,
  TEMP_DIMS,
  TEMP_FACTORS,
  TRACK_NAMES,
} from "./codes.js";
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

const rowsOf = (sheet: string, key: string) =>
  (SCORE_SHEETS[sheet] ?? []).filter((row) => row.c[0] === key);

describe("temperament and service codes", () => {
  test("dimensions follow 18_기질설정 차원 rows", () => {
    expect(TEMP_DIMS).toEqual(rowsOf("18_기질설정", "차원").map((r) => r.c[1]));
  });

  test("factors follow 18_기질설정 요소 rows", () => {
    const names = rowsOf("18_기질설정", "요소").map(
      (row) => String(row.c[1]).split(" ")[0],
    );
    expect(TEMP_FACTORS).toEqual(names);
  });

  test("service codes are in the 23_동점규칙 fixed tie order", () => {
    const tieRow = rowsOf("23_동점규칙", "서비스").find(
      (row) => row.c[1] === "4",
    );
    expect(SERVICE_CODES).toEqual(String(tieRow?.c[3]).split(" \u2192 "));
  });

  test("service codes match 07_서비스 rows", () => {
    const codes = (SCORE_SHEETS["07_서비스"] ?? [])
      .filter((row) => row.r >= 5 && row.r <= 14)
      .map((row) => row.c[0]);
    expect(SERVICE_CODES).toEqual([...new Set(codes)]);
  });
});
