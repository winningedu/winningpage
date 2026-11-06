// 엑셀 첫 시트를 브라우저에서 읽어 칸 줄로 돌려준다(명단 W11, 교사 W15 가 함께 쓴다). 서버 주소 없이 읽는다.
// 머리글 줄(첫 칸이 header)과 빈 줄은 버리고, 칸은 앞뒤 공백을 자르고 width 칸까지만 남긴다.

const MAX_FILE_BYTES = 2 * 1024 * 1024;
// 빈 줄은 한도에 세지 않으므로 읽는 줄은 따로 막는다(압축을 푼 뒤 부풀어 오르는 파일 대비).
const MAX_SCAN_ROWS = 10000;
const ACCEPTED_FILE = /\.(xlsx|xls|csv)$/i;

export interface SheetOptions {
  /** 남길 칸 수. */
  width: number;
  /** 첫 칸이 이 글자인 줄은 머리글이라 버린다. */
  header: string;
  /** 머리글과 빈 줄을 뺀 줄 수의 한도. */
  maxRows: number;
  /** unreadable 은 읽을 수 없거나 읽을 줄이 없을 때, tooLarge 는 파일과 읽는 줄이 너무 클 때, tooMany 는 maxRows 를 넘을 때. */
  messages: { unreadable: string; tooLarge: string; tooMany: string };
}

export async function readSheetLines(
  file: File,
  { width, header, maxRows, messages }: SheetOptions,
): Promise<string[][]> {
  // 끌어다 놓기는 accept 를 거치지 않으므로 확장자를 여기서 다시 거른다.
  if (!ACCEPTED_FILE.test(file.name)) throw new Error(messages.unreadable);
  // 신뢰할 수 없는 파일이라 읽기 전에 크기부터 막는다(결정 56).
  if (file.size > MAX_FILE_BYTES) throw new Error(messages.tooLarge);
  let grid: string[][];
  let tooLarge = false;
  try {
    // 콘솔 첫 묶음에 들어가지 않도록 읽을 때만 불러온다.
    const XLSX = await import("xlsx");
    // 머리글 한 줄과 MAX_SCAN_ROWS 줄까지만 읽는다.
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      sheetRows: MAX_SCAN_ROWS + 1,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error(messages.unreadable);
    // sheetRows 로 잘리기 전 전체 범위가 !fullref 에 남는다.
    const fullRef = sheet["!fullref"] ?? sheet["!ref"];
    tooLarge =
      fullRef !== undefined &&
      XLSX.utils.decode_range(fullRef).e.r > MAX_SCAN_ROWS;
    grid = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map((cell) => String(cell).trim()));
  } catch {
    throw new Error(messages.unreadable);
  }
  if (tooLarge) throw new Error(messages.tooLarge);

  const rows = grid
    .filter((row) => row[0] !== header && row.some((cell) => cell !== ""))
    .map((row) => row.slice(0, width));
  if (rows.length === 0) throw new Error(messages.unreadable);
  if (rows.length > maxRows) throw new Error(messages.tooMany);
  return rows;
}
