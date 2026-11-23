// W11 샘플 엑셀 양식 두 개(public/templates). 화면의 "샘플 엑셀 양식" 버튼이 내려받는 정적 파일이라
// 열 머리글이 미리보기 파서(rolloverPreview)와 설계 결정 34 의 열과 맞아야 한다.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { parseRolloverText } from "../../_lib/console/rolloverPreview.js";

function readSheet(name: string): string[][] {
  const path = join(process.cwd(), "public", "templates", name);
  const book = XLSX.read(readFileSync(path));
  const sheet = book.Sheets[book.SheetNames[0] as string] as XLSX.WorkSheet;
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
}

describe("W11 sample templates", () => {
  test("grade-bulk-change.xlsx has the nine columns of the bulk change and an example row the preview can read", () => {
    const [header, example] = readSheet("grade-bulk-change.xlsx");

    expect(header).toEqual([
      "이름",
      "기존 학년",
      "그룹",
      "반",
      "번호",
      "새 학년",
      "그룹",
      "반",
      "번호",
    ]);
    const parsed = parseRolloverText((example ?? []).join("\t"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).not.toBe("");
  });

  test("student-roster.xlsx has the five roster columns: name, grade, group, class, number", () => {
    const [header, example] = readSheet("student-roster.xlsx");

    expect(header).toEqual(["이름", "학년", "그룹", "반", "번호"]);
    expect(example).toHaveLength(5);
  });

  test("examples use only the six grades (중1~고3); the bulk change keeps one 다학년 example, the roster leaves the grade empty for an academy mixed-grade class", () => {
    const bulk = readSheet("grade-bulk-change.xlsx");
    const roster = readSheet("student-roster.xlsx");

    expect(bulk[1]).toEqual([
      "홍길동",
      "고1",
      "없음",
      "4",
      "7",
      "고2",
      "없음",
      "3",
      "8",
    ]);
    expect(bulk[2]).toEqual([
      "이다학",
      "고1",
      "없음",
      "A",
      "5",
      "다학년",
      "없음",
      "A",
      "5",
    ]);
    expect(roster.slice(1)).toEqual([
      ["홍길동", "고1", "없음", "4", "7"],
      ["임채원", "고2", "없음", "A", "5"],
      ["김다학", "", "없음", "B", "3"],
    ]);
    for (const row of [...bulk.slice(1), ...roster.slice(1)]) {
      expect(parseRolloverText(row.join("\t"))).toHaveLength(1);
    }
  });

  test("student-roster.xlsx carries data validation: 학년 list of six grades, 반 custom rule (no 반 character), 반 cells text format", () => {
    const template = join(
      process.cwd(),
      "public",
      "templates",
      "student-roster.xlsx",
    );
    const xml = execFileSync(
      "unzip",
      ["-p", template, "xl/worksheets/sheet1.xml"],
      { encoding: "utf8" },
    );
    const rules =
      xml.match(/<dataValidation [^>]*>.*?<\/dataValidation>/g) ??
      ([] as string[]);
    const rule = (sqref: string) =>
      rules.find((r) => r.includes(`sqref="${sqref}"`)) ?? "";

    expect(rule("B2:B500")).toContain('type="list"');
    expect(rule("B2:B500")).toContain("중1,중2,중3,고1,고2,고3");
    expect(rule("D2:D500")).toContain('type="custom"');
    expect(rule("D2:D500")).toContain(
      '<formula1>ISERROR(SEARCH("반",D2))</formula1>',
    );
    expect(rule("D2:D500")).toContain("반 칸에는");
    expect(rules).toHaveLength(2);

    // numFmtId 49 is the built-in text format "@"; it must be the style of every 반 cell.
    const styles = execFileSync("unzip", ["-p", template, "xl/styles.xml"], {
      encoding: "utf8",
    });
    const textXf = (
      styles.split("<cellXfs")[1]?.match(/<xf [^>]*>/g) ?? ([] as string[])
    ).findIndex((x) => x.includes('numFmtId="49"'));
    expect(textXf).toBeGreaterThan(0);
    for (const ref of ["D2", "D3", "D4", "D500"]) {
      expect(xml).toMatch(new RegExp(`<c r="${ref}" s="${textXf}"`));
    }
  });
});
