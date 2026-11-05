// 명단 엑셀을 ③ 입력칸 줄로 바꾸는 규칙(결정 50).

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  EMPTY_ROSTER_MESSAGE,
  readRosterLines,
  TOO_LARGE_ROSTER_MESSAGE,
} from "./rosterFile";

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

  it("2MB를 넘는 파일은 읽지 않고 너무 크다는 문구로 실패한다", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.xlsx");
    await expect(readRosterLines(file)).rejects.toThrow(
      TOO_LARGE_ROSTER_MESSAGE,
    );
  });

  it("데이터가 2,000줄을 넘으면 너무 크다는 문구로 실패한다", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [
      `학생${i}`,
      "1학년",
      "4",
      "7",
    ]);
    const file = xlsxFile([["이름", "학년", "반", "번호"], ...rows]);
    await expect(readRosterLines(file)).rejects.toThrow(
      TOO_LARGE_ROSTER_MESSAGE,
    );
  });

  it("데이터가 2,000줄이면 그대로 읽는다", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => [
      `학생${i}`,
      "1학년",
      "4",
      "7",
    ]);
    const file = xlsxFile([["이름", "학년", "반", "번호"], ...rows]);
    expect((await readRosterLines(file)).split("\n")).toHaveLength(2000);
  });
});
