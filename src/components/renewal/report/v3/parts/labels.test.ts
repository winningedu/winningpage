import { describe, expect, it } from "vitest";
import { COPY_TEXT } from "@/lib/diagnosis-v3/source/copyText";
import { SCORE_SHEETS } from "@/lib/diagnosis-v3/source/scoreSheets";
import { SUBJECT_LABELS, VERDICT_LABELS } from "./labels";

const cell = (sheet: string, r: number, c: number) =>
  String(SCORE_SHEETS[sheet]?.find((row) => row.r === r)?.c[c]);

describe("v3 report labels trace to the sheets", () => {
  it("school subject labels follow 22_리포트요소 D44 in order", () => {
    const { HIST: _hist, ...school } = SUBJECT_LABELS;
    expect(cell("22_리포트요소", 44, 3)).toContain(
      `과목 = ${Object.values(school).join("\u00b7")}`,
    );
  });

  it("verdict labels are the SUBJ_J_ copy id suffixes", () => {
    for (const label of Object.values(VERDICT_LABELS)) {
      expect(COPY_TEXT[`SUBJ_J_${label}`]).toBeDefined();
    }
  });
});
