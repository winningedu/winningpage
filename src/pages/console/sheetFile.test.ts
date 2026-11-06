// 엑셀 첫 시트를 칸 줄로 읽는 공용 규칙. 두 화면(명단, 교사)이 같은 읽기를 쓴다.

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSheetLines } from "./sheetFile";

const MESSAGES = {
  unreadable: "읽을 수 없어요",
  tooLarge: "너무 커요",
  tooMany: "줄이 너무 많아요",
};

function xlsxFile(aoa: string[][], name = "a.xlsx"): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "S1");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([data], name);
}

const read = (file: File, over = {}) =>
  readSheetLines(file, {
    width: 3,
    header: "이름",
    maxRows: 2,
    messages: MESSAGES,
    ...over,
  });

describe("readSheetLines", () => {
  it("머리글과 빈 줄을 버리고 칸을 width 로 자른 줄을 준다", async () => {
    const file = xlsxFile([
      ["이름", "a", "b", "c"],
      ["홍길동", "1", "2", "3"],
      ["", "", "", ""],
      ["김하늘", " 4 ", "5", "6"],
    ]);
    expect(await read(file)).toEqual([
      ["홍길동", "1", "2"],
      ["김하늘", "4", "5"],
    ]);
  });

  it("엑셀이 아닌 확장자는 읽지 않는다", async () => {
    await expect(read(new File(["a"], "a.txt"))).rejects.toThrow(
      MESSAGES.unreadable,
    );
  });

  it("2MB 를 넘으면 읽기 전에 막는다", async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.xlsx");
    await expect(read(big)).rejects.toThrow(MESSAGES.tooLarge);
  });

  it("읽을 줄이 없으면 읽을 수 없다는 안내다", async () => {
    await expect(read(xlsxFile([["이름", "a"]]))).rejects.toThrow(
      MESSAGES.unreadable,
    );
  });

  it("줄이 maxRows 를 넘으면 너무 많다는 안내다", async () => {
    const file = xlsxFile([["x"], ["y"], ["z"]]);
    await expect(read(file)).rejects.toThrow(MESSAGES.tooMany);
  });
});
