// 명단 엑셀을 읽어 ③ 입력칸에 넣을 탭 줄로 바꾼다(결정 50). 서버는 탭이 있으면 탭으로 나누므로 칸 안의 쉼표가 칸을 밀지 않는다. 서버 주소 없이 브라우저에서 읽는다.
// 첫 시트만 읽고 머리글 줄(첫 칸 "이름")은 건너뛴다.
//   4칸 명단(이름, 학년, 반, 번호): 기존 칸으로 넣고 새 칸은 비운다.
//   9칸 ③ 양식: 그대로 쓴다.

import { readSheetLines } from "../sheetFile";

export const EMPTY_ROSTER_MESSAGE = "엑셀에서 읽을 줄이 없어요";
export const TOO_LARGE_ROSTER_MESSAGE =
  "파일이 너무 커요. 2MB, 2,000줄 이하로 올려 주세요";

const MAX_DATA_ROWS = 2000;

const ROSTER_WIDTH = 4;
const BULK_WIDTH = 9;

export async function readRosterLines(file: File): Promise<string> {
  const rows = await readSheetLines(file, {
    width: BULK_WIDTH,
    header: "이름",
    maxRows: MAX_DATA_ROWS,
    messages: {
      unreadable: EMPTY_ROSTER_MESSAGE,
      tooLarge: TOO_LARGE_ROSTER_MESSAGE,
      tooMany: TOO_LARGE_ROSTER_MESSAGE,
    },
  });
  // 시트는 모든 줄이 같은 칸 수로 읽힌다.
  const width = Math.max(...rows.map((row) => row.length));
  if (width < ROSTER_WIDTH) throw new Error(EMPTY_ROSTER_MESSAGE);
  return rows
    .map((row) =>
      width >= BULK_WIDTH
        ? row
        : [row[0], row[1], "", row[2], row[3], "", "", "", ""],
    )
    .map((cells) => cells.map((c) => c ?? "").join("\t"))
    .join("\n");
}
