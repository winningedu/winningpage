// 명단 엑셀을 읽어 ③ 입력칸에 넣을 탭 줄로 바꾼다(결정 50). 서버는 탭이 있으면 탭으로 나누므로 칸 안의 쉼표가 칸을 밀지 않는다. 서버 주소 없이 브라우저에서 읽는다.
// 첫 시트만 읽고 머리글 줄(첫 칸 "이름")은 건너뛴다.
//   4칸 명단(이름, 학년, 반, 번호): 기존 칸으로 넣고 새 칸은 비운다.
//   9칸 ③ 양식: 그대로 쓴다.

export const EMPTY_ROSTER_MESSAGE = "엑셀에서 읽을 줄이 없어요";
export const TOO_LARGE_ROSTER_MESSAGE =
  "파일이 너무 커요. 2MB, 2,000줄 이하로 올려 주세요";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_ROWS = 2000;

const ROSTER_WIDTH = 4;
const BULK_WIDTH = 9;

export async function readRosterLines(file: File): Promise<string> {
  // 신뢰할 수 없는 파일이라 읽기 전에 크기부터 막는다(결정 56).
  if (file.size > MAX_FILE_BYTES) throw new Error(TOO_LARGE_ROSTER_MESSAGE);
  let grid: string[][];
  let tooLarge = false;
  try {
    // 콘솔 첫 묶음에 들어가지 않도록 읽을 때만 불러온다.
    const XLSX = await import("xlsx");
    // 머리글 한 줄과 데이터 MAX_DATA_ROWS 줄까지만 읽는다.
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      sheetRows: MAX_DATA_ROWS + 1,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error(EMPTY_ROSTER_MESSAGE);
    // sheetRows 로 잘리기 전 전체 범위가 !fullref 에 남는다.
    const fullRef = sheet["!fullref"] ?? sheet["!ref"];
    tooLarge =
      fullRef !== undefined &&
      XLSX.utils.decode_range(fullRef).e.r > MAX_DATA_ROWS;
    grid = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map((cell) => String(cell).trim()));
  } catch {
    throw new Error(EMPTY_ROSTER_MESSAGE);
  }

  if (tooLarge) throw new Error(TOO_LARGE_ROSTER_MESSAGE);

  const width = Math.max(0, ...grid.map((row) => row.length));
  const lines = grid
    .filter((row) => row[0] !== "이름" && row.some((cell) => cell !== ""))
    .map((row) =>
      width >= BULK_WIDTH
        ? row.slice(0, BULK_WIDTH)
        : [row[0], row[1], "", row[2], row[3], "", "", "", ""],
    )
    .map((cells) => cells.map((c) => c ?? "").join("\t"));
  if (width < ROSTER_WIDTH || lines.length === 0)
    throw new Error(EMPTY_ROSTER_MESSAGE);
  return lines.join("\n");
}
