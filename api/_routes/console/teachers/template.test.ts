// W15 교사 엑셀 양식(public/templates/teacher-roster.xlsx). 화면의 "양식 내려받기(.xlsx)" 버튼이 내려받는 정적 파일이라
// 열 머리글이 화면의 안내("교사명, 전화번호, 학년, 그룹, 반")와 일괄 등록 행 모양과 맞아야 한다.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

const TEMPLATE = join(
  process.cwd(),
  "public",
  "templates",
  "teacher-roster.xlsx",
);

describe("W15 teacher-roster.xlsx", () => {
  test("has the five columns of the screen and two example rows that carry a name, a phone number, a grade and a class", () => {
    const path = join(
      process.cwd(),
      "public",
      "templates",
      "teacher-roster.xlsx",
    );
    const book = XLSX.read(readFileSync(path));
    const sheet = book.Sheets[book.SheetNames[0] as string] as XLSX.WorkSheet;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: "",
    });

    expect(rows[0]).toEqual(["선생님 이름", "전화번호", "학년", "그룹", "반"]);
    expect(rows).toHaveLength(3);
    for (const example of rows.slice(1)) {
      expect(example[0]).not.toBe("");
      expect(example[1]).toMatch(/^010-\d{4}-\d{4}$/);
      expect(["중1", "중2", "중3", "고1", "고2", "고3"]).toContain(example[2]);
      expect(example[4]).toMatch(/^[0-9]+$/);
    }
  });

  test("columns carry data validation: 학년 list of six grades, 반 whole number >= 1, 전화번호 text format", () => {
    const xml = execFileSync(
      "unzip",
      ["-p", TEMPLATE, "xl/worksheets/sheet1.xml"],
      { encoding: "utf8" },
    );
    const rules =
      xml.match(/<dataValidation [^>]*>.*?<\/dataValidation>/g) ??
      ([] as string[]);
    const rule = (sqref: string) =>
      rules.find((r) => r.includes(`sqref="${sqref}"`)) ?? "";

    expect(rule("C2:C500")).toContain('type="list"');
    expect(rule("C2:C500")).toContain("중1,중2,중3,고1,고2,고3");
    expect(rule("E2:E500")).toContain('type="whole"');
    expect(rule("E2:E500")).toContain('operator="greaterThanOrEqual"');
    expect(rule("E2:E500")).toContain("<formula1>1</formula1>");

    // numFmtId 49 is the built-in text format "@"; it must be the style of every 전화번호 cell.
    const styles = execFileSync("unzip", ["-p", TEMPLATE, "xl/styles.xml"], {
      encoding: "utf8",
    });
    const textXf = (
      styles.split("<cellXfs")[1]?.match(/<xf [^>]*>/g) ?? ([] as string[])
    ).findIndex((x) => x.includes('numFmtId="49"'));
    expect(textXf).toBeGreaterThan(0);
    for (const ref of ["B2", "B3", "B4", "B500"]) {
      expect(xml).toMatch(new RegExp(`<c r="${ref}" s="${textXf}"`));
    }
  });
});
