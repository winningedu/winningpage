// 명단 엑셀을 ③ 입력칸 줄로 바꾸는 규칙(결정 50).

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { EMPTY_ROSTER_MESSAGE, readRosterLines } from "./rosterFile";

function xlsxFile(...sheets: string[][][]): File {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((aoa, i) => {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(aoa),
      `Sheet${i + 1}`,
    );
  });
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([data], "roster.xlsx");
}

describe("readRosterLines", () => {
  it("4칸 명단은 기존 칸으로 넣고 새 칸은 비워 쉼표 줄로 만든다", async () => {
    const file = xlsxFile([
      ["이름", "학년", "반", "번호"],
      ["홍길동", "1학년", "4", "7"],
      ["김하늘", "2학년", "3", "12"],
    ]);
    expect(await readRosterLines(file)).toBe(
      "홍길동,1학년,,4,7,,,,\n김하늘,2학년,,3,12,,,,",
    );
  });

  it("9칸 양식은 그대로 쓴다", async () => {
    const file = xlsxFile([
      [
        "이름",
        "기존 학년그룹",
        "그룹",
        "반",
        "번호",
        "새 학년그룹",
        "그룹",
        "반",
        "번호",
      ],
      ["홍길동", "1학년", "없음", "4", "7", "2학년", "없음", "3", "8"],
    ]);
    expect(await readRosterLines(file)).toBe(
      "홍길동,1학년,없음,4,7,2학년,없음,3,8",
    );
  });

  it("첫 시트만 읽고 빈 줄은 건너뛴다", async () => {
    const file = xlsxFile(
      [
        ["이름", "학년", "반", "번호"],
        ["홍길동", "1학년", "4", "7"],
        ["", "", "", ""],
      ],
      [["다른시트", "1학년", "1", "1"]],
    );
    expect(await readRosterLines(file)).toBe("홍길동,1학년,,4,7,,,,");
  });

  it("읽을 줄이 없으면 안내 문구로 실패한다", async () => {
    const file = xlsxFile([["이름", "학년", "반", "번호"]]);
    await expect(readRosterLines(file)).rejects.toThrow(EMPTY_ROSTER_MESSAGE);
  });

  it("엑셀이 아닌 파일도 같은 안내 문구로 실패한다", async () => {
    const file = new File(["not an excel"], "a.xlsx");
    await expect(readRosterLines(file)).rejects.toThrow(EMPTY_ROSTER_MESSAGE);
  });
});
