import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildCopyText,
  extractSheets,
} from "../../../../scripts/lib/diagnosisV3Extract.mjs";

const load = (name: string) =>
  extractSheets(readFileSync(new URL(`./${name}-v3.0.xlsx`, import.meta.url)));

const sheetRows = (sheets: ReturnType<typeof load>, name: string) => {
  const rows = sheets[name];
  if (!rows) throw new Error(`missing sheet ${name}`);
  return rows;
};

describe("xlsx extraction", () => {
  const score = load("score");
  const copy = load("copy");

  test("score workbook keeps all 24 sheets in order", () => {
    expect(Object.keys(score)).toHaveLength(24);
    expect(Object.keys(score)[0]).toBe("00_안내");
  });

  test("sheet 09 has 401 data rows after its header", () => {
    const rows = sheetRows(score, "09_환산_5등급제");
    const header = rows.findIndex((row) => row.c[0] === "No");
    expect(rows.length - header - 1).toBe(401);
  });

  test("rows carry their 1-based source row number", () => {
    const rows = sheetRows(copy, "01_유형문구");
    expect(rows[0]).toEqual({
      r: 1,
      c: ["01. 학생 유형 문구 (9종 \u00D7 5)", null, null, null],
    });
  });

  test("copy text maps IDs to the text column", () => {
    const text = buildCopyText(copy);
    expect(text.TYPE_1_HEAD).toBe(
      "목표\u2013계획\u2013실행\u2013피드백의 흐름이 안정적으로 돌아가고 있습니다.",
    );
  });
});
