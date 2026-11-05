// 교사 엑셀(W15)을 브라우저에서 읽는다. 서버 주소 없이 읽고, 결과는 한 줄에 한 학급을 탭으로 이은 글이다.
// 붙여넣은 글과 같은 parseTeacherLines 로 행을 만든다(교 #122). 첫 시트만 읽고 머리글(첫 칸 "교사명")은 건너뛴다.

export const EMPTY_TEACHER_MESSAGE =
  "엑셀 파일을 읽을 수 없어요. .xlsx, .xls, .csv 파일인지 확인하거나, 엑셀에서 복사한 명단을 붙여넣어 보세요";
export const TOO_LARGE_TEACHER_MESSAGE =
  "파일이 너무 커요. 2MB, 200줄 이하로 올려 주세요";
export const TOO_MANY_TEACHER_MESSAGE =
  "한 번에 200줄까지 올릴 수 있어요. 나눠서 올려 주세요";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
// 서버 미리보기가 한 번에 판정하는 행 수와 같다(MAX_PREVIEW_ROWS).
export const MAX_TEACHER_ROWS = 200;
// 빈 줄은 한도에 세지 않으므로 읽는 줄은 따로 막는다(압축을 푼 뒤 부풀어 오르는 파일 대비).
const MAX_SCAN_ROWS = 10000;
const ACCEPTED_FILE = /\.(xlsx|xls|csv)$/i;
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
  // 끌어다 놓기는 accept 를 거치지 않으므로 확장자를 여기서 다시 거른다.
  if (!ACCEPTED_FILE.test(file.name)) throw new Error(EMPTY_TEACHER_MESSAGE);
  // 신뢰할 수 없는 파일이라 읽기 전에 크기부터 막는다.
  if (file.size > MAX_FILE_BYTES) throw new Error(TOO_LARGE_TEACHER_MESSAGE);
  let grid: string[][];
  let tooLarge = false;
  try {
    // 콘솔 첫 묶음에 들어가지 않도록 읽을 때만 불러온다.
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      sheetRows: MAX_SCAN_ROWS + 1,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error(EMPTY_TEACHER_MESSAGE);
    const fullRef = sheet["!fullref"] ?? sheet["!ref"];
    tooLarge =
      fullRef !== undefined &&
      XLSX.utils.decode_range(fullRef).e.r > MAX_SCAN_ROWS;
    grid = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map((cell) => String(cell).trim()));
  } catch {
    throw new Error(EMPTY_TEACHER_MESSAGE);
  }
  if (tooLarge) throw new Error(TOO_LARGE_TEACHER_MESSAGE);

  const lines = grid
    .filter((row) => row[0] !== HEADER_FIRST_CELL && row.some((c) => c !== ""))
    .map((row) =>
      Array.from({ length: WIDTH }, (_, i) => row[i] ?? "").join("\t"),
    );
  if (lines.length === 0) throw new Error(EMPTY_TEACHER_MESSAGE);
  if (lines.length > MAX_TEACHER_ROWS)
    throw new Error(TOO_MANY_TEACHER_MESSAGE);
  return lines.join("\n");
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
