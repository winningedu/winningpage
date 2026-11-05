// 명단 엑셀을 읽어 ③ 입력칸에 넣을 쉼표 줄로 바꾼다(결정 50). 서버 주소 없이 브라우저에서 읽는다.
// 첫 시트만 읽고 머리글 줄(첫 칸 "이름")은 건너뛴다.
//   4칸 명단(이름, 학년, 반, 번호): 기존 칸으로 넣고 새 칸은 비운다.
//   9칸 ③ 양식: 그대로 쓴다.

import * as XLSX from "xlsx";

export const EMPTY_ROSTER_MESSAGE = "엑셀에서 읽을 줄이 없어요";

const ROSTER_WIDTH = 4;
const BULK_WIDTH = 9;

export async function readRosterLines(file: File): Promise<string> {
  let grid: string[][];
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error(EMPTY_ROSTER_MESSAGE);
    grid = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map((cell) => String(cell).trim()));
  } catch {
    throw new Error(EMPTY_ROSTER_MESSAGE);
  }

  const width = Math.max(0, ...grid.map((row) => row.length));
  const lines = grid
    .filter((row) => row[0] !== "이름" && row.some((cell) => cell !== ""))
    .map((row) =>
      width >= BULK_WIDTH
        ? row.slice(0, BULK_WIDTH)
        : [row[0], row[1], "", row[2], row[3], "", "", "", ""],
    )
    .map((cells) => cells.map((c) => c ?? "").join(","));
  if (width < ROSTER_WIDTH || lines.length === 0)
    throw new Error(EMPTY_ROSTER_MESSAGE);
  return lines.join("\n");
}
