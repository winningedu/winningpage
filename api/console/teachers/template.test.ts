// W15 교사 엑셀 양식(public/templates/teacher-roster.xlsx). 화면의 "양식 내려받기(.xlsx)" 버튼이 내려받는 정적 파일이라
// 열 머리글이 화면의 안내("교사명, 전화번호, 학년, 그룹, 반")와 일괄 등록 행 모양과 맞아야 한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

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

    expect(rows[0]).toEqual(["교사명", "전화번호", "학년", "그룹", "반"]);
    expect(rows).toHaveLength(3);
    for (const example of rows.slice(1)) {
      expect(example[0]).not.toBe("");
      expect(example[1]).toMatch(/^010-\d{4}-\d{4}$/);
      expect(["중1", "중2", "중3", "고1", "고2", "고3"]).toContain(example[2]);
      expect(example[4]).not.toBe("");
    }
  });
});
