// 교사 엑셀(W15)을 브라우저에서 읽는다. 서버 주소 없이 읽고, 결과는 한 줄에 한 학급을 탭으로 이은 글이다.
// 붙여넣은 글과 같은 parseTeacherLines 로 행을 만든다(교 #122). 첫 시트만 읽고 머리글(첫 칸 "교사명")은 건너뛴다.

import { readSheetLines } from "../sheetFile";

export const EMPTY_TEACHER_MESSAGE =
  "엑셀 파일을 읽을 수 없어요. .xlsx, .xls, .csv 파일인지 확인하거나, 엑셀에서 복사한 명단을 붙여넣어 보세요";
export const TOO_LARGE_TEACHER_MESSAGE =
  "파일이 너무 커요. 2MB, 200줄 이하로 올려 주세요";
export const TOO_MANY_TEACHER_MESSAGE =
  "한 번에 200줄까지 올릴 수 있어요. 나눠서 올려 주세요";

// 서버 미리보기가 한 번에 판정하는 행 수와 같다(MAX_PREVIEW_ROWS).
export const MAX_TEACHER_ROWS = 200;
const WIDTH = 5;
const HEADER_FIRST_CELL = "교사명";

export interface TeacherFileRow {
  name: string;
  phone: string;
  grade: string;
  group: string;
  className: string;
}

export async function readTeacherFile(file: File): Promise<string> {
  const rows = await readSheetLines(file, {
    width: WIDTH,
    header: HEADER_FIRST_CELL,
    maxRows: MAX_TEACHER_ROWS,
    messages: {
      unreadable: EMPTY_TEACHER_MESSAGE,
      tooLarge: TOO_LARGE_TEACHER_MESSAGE,
      tooMany: TOO_MANY_TEACHER_MESSAGE,
    },
  });
  return rows
    .map((row) =>
      Array.from({ length: WIDTH }, (_, i) => row[i] ?? "").join("\t"),
    )
    .join("\n");
}

/** 탭이 있으면 탭으로, 없으면 쉼표로 나눈다. 빈 줄과 머리글 줄은 버린다. */
export function parseTeacherLines(text: string): TeacherFileRow[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")))
    .map((cells) => cells.map((c) => c.trim()))
    .filter((cells) => cells[0] !== HEADER_FIRST_CELL)
    .map((cells) => ({
      name: cells[0] ?? "",
      phone: cells[1] ?? "",
      grade: cells[2] ?? "",
      group: cells[3] ?? "",
      className: cells[4] ?? "",
    }));
}
