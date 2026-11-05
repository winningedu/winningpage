// W11 샘플 엑셀 양식 두 개(public/templates). 화면의 "샘플 엑셀 양식" 버튼이 내려받는 정적 파일이라
// 열 머리글이 미리보기 파서(rolloverPreview)와 설계 결정 34 의 열과 맞아야 한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { parseRolloverText } from "../_lib/console/rolloverPreview.js";

function readSheet(name: string): string[][] {
  const path = join(process.cwd(), "public", "templates", name);
  const book = XLSX.read(readFileSync(path));
  const sheet = book.Sheets[book.SheetNames[0] as string] as XLSX.WorkSheet;
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
  });
}

describe("W11 sample templates", () => {
  test("grade-bulk-change.xlsx has the nine columns of the bulk change and an example row the preview can read", () => {
    const [header, example] = readSheet("grade-bulk-change.xlsx");

    expect(header).toEqual([
      "이름",
      "기존 학년그룹",
      "그룹",
      "반",
      "번호",
      "새 학년그룹",
      "그룹",
      "반",
      "번호",
    ]);
    const parsed = parseRolloverText((example ?? []).join("\t"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).not.toBe("");
  });

  test("student-roster.xlsx has the roster columns of decision 34", () => {
    const [header, example] = readSheet("student-roster.xlsx");

    expect(header).toEqual(["이름", "학년", "반", "번호"]);
    expect(example).toHaveLength(4);
  });
});
