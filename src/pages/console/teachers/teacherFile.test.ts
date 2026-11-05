// 교사 엑셀(W15)을 브라우저에서 읽어 탭 줄로 바꾸고, 붙여넣은 글과 같은 규칙으로 행을 만든다(교 #121, #122, #206).

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  EMPTY_TEACHER_MESSAGE,
  parseTeacherLines,
  readTeacherFile,
  TOO_LARGE_TEACHER_MESSAGE,
  TOO_MANY_TEACHER_MESSAGE,
} from "./teacherFile";

function xlsxFile(aoa: string[][], name = "teachers.xlsx"): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(aoa),
    "Sheet1",
  );
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([data], name);
}

const HEADER = ["교사명", "전화번호", "학년", "그룹", "반"];

describe("readTeacherFile", () => {
  it("머리글을 건너뛰고 한 줄에 한 학급을 탭으로 이은 줄로 돌려준다", async () => {
    const file = xlsxFile([
      HEADER,
      ["박지훈", "010-1234-5678", "고2", "", "3반"],
      ["임채원", "010-4321-8765", "고1", "A레벨", "4반"],
    ]);

    expect(await readTeacherFile(file)).toBe(
      "박지훈\t010-1234-5678\t고2\t\t3반\n임채원\t010-4321-8765\t고1\tA레벨\t4반",
    );
  });

  it("빈 줄은 건너뛰고 모자란 칸은 빈 값으로 채운다", async () => {
    const file = xlsxFile([
      HEADER,
      ["", "", "", "", ""],
      ["박지훈", "01012345678"],
    ]);

    expect(await readTeacherFile(file)).toBe("박지훈\t01012345678\t\t\t");
  });

  it("엑셀이나 CSV 가 아니면 읽을 수 없다고 한다", async () => {
    await expect(
      readTeacherFile(new File(["x"], "teachers.pdf")),
    ).rejects.toThrow(EMPTY_TEACHER_MESSAGE);
  });

  it("읽을 줄이 없으면 읽을 수 없다고 한다", async () => {
    await expect(readTeacherFile(xlsxFile([HEADER]))).rejects.toThrow(
      EMPTY_TEACHER_MESSAGE,
    );
  });

  it("2MB 를 넘는 파일은 열지 않고 너무 크다고 한다", async () => {
    const big = new File(
      [new Uint8Array(2 * 1024 * 1024 + 1)],
      "teachers.xlsx",
    );

    await expect(readTeacherFile(big)).rejects.toThrow(
      TOO_LARGE_TEACHER_MESSAGE,
    );
  });

  it("200줄을 넘으면 너무 많다고 한다", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => [
      `교사${i}`,
      "01012345678",
      "고1",
      "",
      `${i + 1}반`,
    ]);

    await expect(readTeacherFile(xlsxFile([HEADER, ...rows]))).rejects.toThrow(
      TOO_MANY_TEACHER_MESSAGE,
    );
  });
});

describe("parseTeacherLines", () => {
  it("탭이 있으면 탭으로, 없으면 쉼표로 나누고 빈 줄과 머리글은 버린다", () => {
    expect(
      parseTeacherLines(
        "교사명\t전화번호\t학년\t그룹\t반\n박지훈\t010-1234-5678\t고2\t\t3반\n\n임채원, 010-4321-8765, 고1, , 4반",
      ),
    ).toEqual([
      {
        name: "박지훈",
        phone: "010-1234-5678",
        grade: "고2",
        group: "",
        className: "3반",
      },
      {
        name: "임채원",
        phone: "010-4321-8765",
        grade: "고1",
        group: "",
        className: "4반",
      },
    ]);
  });

  it("줄이 없으면 빈 목록이다", () => {
    expect(parseTeacherLines("  \n")).toEqual([]);
  });
});
